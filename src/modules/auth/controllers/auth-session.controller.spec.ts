import {
  INestApplication,
  ValidationPipe,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { App } from 'supertest/types';

import { AuthSessionController } from './auth-session.controller';
import { CredentialLoginService } from '../services/credential-login.service';
import { TokenService } from '../services/token.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { AccountSwitcherService } from '../services/account-switcher.service';
import { RecentLoginsService } from '../services/recent-logins.service';
import { LoginSessionTrackingService } from '../services/login-session-tracking.service';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { AUTH_ERROR_CODES } from '../../../common/constants/error-codes.constants';

jest.mock('../utils/cookie.utils', () => ({
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
  setDeviceIdCookie: jest.fn(),
  getDeviceIdFromRequest: jest.fn().mockReturnValue(null),
}));

import * as cookieUtils from '../utils/cookie.utils';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

describe('AuthSessionController', () => {
  let app: INestApplication<App>;

  const credentialLoginServiceMock = {
    login: jest.fn(),
  };

  const tokenServiceMock = {
    refreshAccessToken: jest.fn(),
    revokeSessionTokens: jest.fn(),
    peekUserIdFromAccessToken: jest.fn(),
    findActiveAccessToken: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }),
  };

  const auditLogServiceMock = {
    logRequest: jest.fn(),
    log: jest.fn(),
  };

  const accountSwitcherMock = {
    rememberAccount: jest.fn(),
  };

  const recentLoginsMock = {
    remember: jest.fn(),
    clearForDevice: jest.fn(),
  };

  const jwtServiceMock = {
    verify: jest.fn(),
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(null);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthSessionController],
      providers: [
        JwtAuthGuard,
        {
          provide: CredentialLoginService,
          useValue: credentialLoginServiceMock,
        },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
        { provide: AccountSwitcherService, useValue: accountSwitcherMock },
        { provide: RecentLoginsService, useValue: recentLoginsMock },
        LoginSessionTrackingService,
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /auth/login', () => {
    const loginDto = { email: 'user@example.com', password: 'Pass1234!' };
    const loginResult = {
      success: true,
      message: 'Sign-in successful.',
      tokens: {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
      },
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: GLOBAL_ROLES.USER,
        fullName: 'Test User',
        avatar: 'avatar.png',
        googleId: null,
        ssoProvider: undefined,
      },
    };

    it('sets access and refresh HttpOnly cookies on successful login', async () => {
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sign-in successful.',
        user: {
          id: loginResult.user.id,
          email: loginResult.user.email,
          role: loginResult.user.role,
          fullName: loginResult.user.fullName,
          avatar: loginResult.user.avatar,
          googleId: loginResult.user.googleId,
        },
        tokens: loginResult.tokens,
      });
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(cookieUtils.setAuthCookies).toHaveBeenCalledWith(
        expect.anything(),
        configServiceMock,
        loginResult.tokens,
      );
    });

    it('returns 429 LOGIN_RETRY_LATER with Retry-After header on login cooldown', async () => {
      const retryAfterSeconds = 5;
      credentialLoginServiceMock.login.mockRejectedValue(
        new LoginRetryLaterException(retryAfterSeconds),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(429);

      expect(response.body).toMatchObject({
        message: 'Please wait before trying again.',
        code: AUTH_ERROR_CODES.LOGIN_RETRY_LATER,
        details: {
          retryAfterSeconds,
        },
      });
      expect(response.headers['retry-after']).toBe(String(retryAfterSeconds));
    });

    it('audits login failure and re-throws the error', async () => {
      const error = new Error('Invalid credentials');
      (error as any).status = 401;
      credentialLoginServiceMock.login.mockRejectedValue(error);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(500);

      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'LOGIN_FAILED',
          severity: 'WARN',
          email: loginDto.email,
          metadata: { reason: 'Invalid credentials' },
        },
      );
    });

    it('generates device ID when none is present and sets cookie', async () => {
      const generatedId = 'new-device-uuid';
      jest
        .spyOn(RecentLoginsService, 'generateDeviceId')
        .mockReturnValue(generatedId);
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(recentLoginsMock.remember).toHaveBeenCalled();
      expect(cookieUtils.setDeviceIdCookie).toHaveBeenCalledWith(
        expect.anything(),
        configServiceMock,
        generatedId,
      );
    });

    it('calls account switcher when existing access token has a different owner', async () => {
      tokenServiceMock.peekUserIdFromAccessToken.mockReturnValue(
        'owner-user-id',
      );
      (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(
        'existing-device-id',
      );
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(accountSwitcherMock.rememberAccount).toHaveBeenCalledWith(
        'owner-user-id',
        expect.objectContaining({ id: loginResult.user.id }),
        expect.any(Object),
      );
    });

    it('does not call account switcher when owner is the same as logged-in user', async () => {
      tokenServiceMock.peekUserIdFromAccessToken.mockReturnValue(
        loginResult.user.id,
      );
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(accountSwitcherMock.rememberAccount).not.toHaveBeenCalled();
    });

    it('does not fail login when account switcher throws', async () => {
      tokenServiceMock.peekUserIdFromAccessToken.mockReturnValue(
        'owner-user-id',
      );
      accountSwitcherMock.rememberAccount.mockRejectedValue(
        new Error('DB error'),
      );
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);
    });
  });

  describe('POST /auth/logout', () => {
    const logoutResult = { message: 'Đăng xuất thành công' };

    it('revokes session tokens and clears cookies', async () => {
      tokenServiceMock.revokeSessionTokens.mockResolvedValue(logoutResult);
      const validToken = 'valid-jwt-token';

      // JwtAuthGuard needs a valid token to pass
      jwtServiceMock.verify.mockReturnValue({
        userId: 'user-1',
        email: 'user@example.com',
        role: GLOBAL_ROLES.USER,
        type: 'access',
      });
      tokenServiceMock.findActiveAccessToken.mockResolvedValue({
        userId: { toString: () => 'user-1' },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', `access_token=${validToken}`)
        .expect(200);

      expect(response.body).toEqual(logoutResult);
      expect(cookieUtils.clearAuthCookies).toHaveBeenCalled();
      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'LOGOUT',
          severity: 'INFO',
          userId: 'user-1',
        },
      );
    });

    it('returns 401 when not authenticated', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('No token');
      });

      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    const refreshResult = {
      success: true,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    };

    it('rotates tokens and updates cookies on success', async () => {
      tokenServiceMock.refreshAccessToken.mockResolvedValue(refreshResult);

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'old-refresh-token' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Token refreshed successfully.',
        tokens: {
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken,
        },
      });
      expect(cookieUtils.setAuthCookies).toHaveBeenCalledWith(
        expect.anything(),
        configServiceMock,
        {
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken,
        },
      );
      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'REFRESH_SUCCESS',
          severity: 'INFO',
        },
      );
    });

    it('returns 401 when no refresh token is provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(401);

      expect(response.body.message).toBe('Refresh token not found');
      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'REFRESH_FAILED',
          severity: 'WARN',
          metadata: { reason: 'Refresh token missing' },
        },
      );
    });

    it('returns 503 with Retry-After: 30 when database is unavailable', async () => {
      tokenServiceMock.refreshAccessToken.mockRejectedValue(
        new ServiceUnavailableException('Database temporarily unavailable'),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'some-token' })
        .expect(503);

      expect(response.headers['retry-after']).toBe('30');
    });
  });
});
