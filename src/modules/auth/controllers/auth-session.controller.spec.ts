import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { App } from 'supertest/types';

import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { AUTH_ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { AuthSessionController } from './auth-session.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { LoginSessionTrackingService } from '../services/login-session-tracking.service';
import { CredentialLoginService } from '../services/credential-login.service';
import { TokenIssuerService } from '../services/token-issuer.service';
import { TokenRefreshService } from '../services/token-refresh.service';
import { TokenRevocationService } from '../services/token-revocation.service';
import { TokenLookupService } from '../services/token-lookup.service';
import { SsoLoginService } from '../services/sso-login.service';

jest.mock('../utils/cookie.utils', () => ({
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
  setDeviceIdCookie: jest.fn(),
  getDeviceIdFromRequest: jest.fn().mockReturnValue(null),
}));

import * as cookieUtils from '../utils/cookie.utils';

describe('AuthSessionController', () => {
  let app: INestApplication<App>;

  const credentialLoginServiceMock = {
    login: jest.fn(),
  };

  const tokenIssuerServiceMock = {
    createAndSaveTokens: jest.fn().mockResolvedValue({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
    }),
  };

  const tokenRevocationServiceMock = {
    revokeSessionTokens: jest.fn(),
  };

  const tokenRefreshServiceMock = {
    refreshAccessToken: jest.fn(),
  };

  const tokenLookupServiceMock = {
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

  const loginSessionTrackingServiceMock = {
    trackLoginSession: jest
      .fn()
      .mockResolvedValue({ generatedDeviceId: undefined }),
  };

  const jwtServiceMock = {
    verify: jest.fn(),
    sign: jest.fn(),
  };

  const ssoLoginServiceMock = {
    generateAuthorizationCode: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(null);
    loginSessionTrackingServiceMock.trackLoginSession.mockResolvedValue({
      generatedDeviceId: undefined,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthSessionController],
      providers: [
        JwtAuthGuard,
        {
          provide: CredentialLoginService,
          useValue: credentialLoginServiceMock,
        },
        { provide: TokenIssuerService, useValue: tokenIssuerServiceMock },
        {
          provide: TokenRevocationService,
          useValue: tokenRevocationServiceMock,
        },
        { provide: TokenRefreshService, useValue: tokenRefreshServiceMock },
        { provide: TokenLookupService, useValue: tokenLookupServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
        {
          provide: LoginSessionTrackingService,
          useValue: loginSessionTrackingServiceMock,
        },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: SsoLoginService, useValue: ssoLoginServiceMock },
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
        tokens: {
          accessToken: 'access-token-value',
          refreshToken: 'refresh-token-value',
        },
      });
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(cookieUtils.setAuthCookies).toHaveBeenCalledWith(
        expect.anything(),
        configServiceMock,
        {
          accessToken: 'access-token-value',
          refreshToken: 'refresh-token-value',
        },
      );
    });

    it('tracks successful login against the device registry', async () => {
      (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(
        'existing-device-id',
      );
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(
        loginSessionTrackingServiceMock.trackLoginSession,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'existing-device-id',
          loggedInUser: expect.objectContaining({ id: loginResult.user.id }),
        }),
      );
    });

    it('sets a device cookie when tracking generates a new device id', async () => {
      credentialLoginServiceMock.login.mockResolvedValue(loginResult);
      loginSessionTrackingServiceMock.trackLoginSession.mockResolvedValue({
        generatedDeviceId: 'new-device-uuid',
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(cookieUtils.setDeviceIdCookie).toHaveBeenCalledWith(
        expect.anything(),
        configServiceMock,
        'new-device-uuid',
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
      (error as Error & { status?: number }).status = 401;
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
  });

  describe('POST /auth/logout', () => {
    const logoutResult = { message: 'Dang xuat thanh cong' };

    it('revokes session tokens and clears cookies', async () => {
      tokenRevocationServiceMock.revokeSessionTokens.mockResolvedValue(
        logoutResult,
      );
      const validToken = 'valid-jwt-token';

      jwtServiceMock.verify.mockReturnValue({
        userId: 'user-1',
        email: 'user@example.com',
        role: GLOBAL_ROLES.USER,
        type: 'access',
      });
      tokenLookupServiceMock.findActiveAccessToken.mockResolvedValue({
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
      tokenRefreshServiceMock.refreshAccessToken.mockResolvedValue(
        refreshResult,
      );

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
      tokenRefreshServiceMock.refreshAccessToken.mockRejectedValue(
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
