import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request = require('supertest');
import { App } from 'supertest/types';

import { AuthProfileController } from '../src/modules/auth/controllers/auth-profile.controller';
import { AuthRegistrationController } from '../src/modules/auth/controllers/auth-registration.controller';
import { AuthSessionController } from '../src/modules/auth/controllers/auth-session.controller';
import { PasswordController } from '../src/modules/auth/controllers/password.controller';
import { AuthRegistrationService } from '../src/modules/auth/services/auth-registration.service';
import { RegistrationVerificationService } from '../src/modules/auth/services/registration-verification.service';
import { CredentialLoginService } from '../src/modules/auth/services/credential-login.service';
import { AuditLogService } from '../src/modules/audit/services/audit-log.service';
import { PasswordResetService } from '../src/modules/auth/services/password-reset.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { UsersService } from '../src/modules/users/services/users.service';
import { AccountSwitcherService } from '../src/modules/auth/services/account-switcher.service';
import { RecentLoginsService } from '../src/modules/auth/services/recent-logins.service';
import { LoginSessionTrackingService } from '../src/modules/auth/services/login-session-tracking.service';
import { GLOBAL_ROLES } from '../src/common/constants/global-role.constants';

describe('Auth throttling (e2e)', () => {
  let app: INestApplication<App>;

  const authRegistrationServiceMock = {
    register: jest.fn(),
  };

  const registrationVerificationServiceMock = {
    verifyRegistrationEmail: jest.fn(),
    resendRegistrationVerification: jest.fn(),
  };

  const credentialLoginServiceMock = {
    login: jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: GLOBAL_ROLES.USER,
      },
    }),
  };

  const tokenServiceMock = {
    refreshAccessToken: jest.fn().mockResolvedValue({
      success: true,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }),
    revokeSessionTokens: jest.fn().mockResolvedValue({ message: 'ok' }),
    findActiveAccessToken: jest.fn(),
    peekUserIdFromAccessToken: jest.fn(),
  };

  const passwordResetServiceMock = {
    requestPasswordReset: jest
      .fn()
      .mockResolvedValue({ success: true, message: 'ok' }),
    verifyOtpAndIssueGrant: jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      resetGrant: 'reset-grant',
      expiresIn: 600_000,
    }),
    resetPasswordWithGrant: jest
      .fn()
      .mockResolvedValue({ success: true, message: 'ok' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
      ],
      controllers: [
        AuthProfileController,
        AuthRegistrationController,
        AuthSessionController,
        PasswordController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: AuthRegistrationService,
          useValue: authRegistrationServiceMock,
        },
        {
          provide: RegistrationVerificationService,
          useValue: registrationVerificationServiceMock,
        },
        {
          provide: CredentialLoginService,
          useValue: credentialLoginServiceMock,
        },
        { provide: PasswordResetService, useValue: passwordResetServiceMock },
        { provide: UsersService, useValue: { getUserById: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'NODE_ENV' ? 'test' : undefined,
            ),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn(), logRequest: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: TokenService, useValue: tokenServiceMock },
        {
          provide: LoginSessionTrackingService,
          useValue: {
            trackLoginSession: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: AccountSwitcherService,
          useValue: { rememberAccount: jest.fn() },
        },
        { provide: RecentLoginsService, useValue: { remember: jest.fn() } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  async function postUntilLimited(
    path: string,
    body: Record<string, unknown>,
    attempts: number,
  ) {
    const responses: request.Response[] = [];
    for (let i = 0; i < attempts; i += 1) {
      responses.push(await request(app.getHttpServer()).post(path).send(body));
    }
    return responses;
  }

  async function getUntilLimited(path: string, attempts: number) {
    const responses: request.Response[] = [];
    for (let i = 0; i < attempts; i += 1) {
      responses.push(await request(app.getHttpServer()).get(path));
    }
    return responses;
  }

  it('returns the same non-disclosing email check response', async () => {
    const existingEmailResponse = await request(app.getHttpServer())
      .get('/auth/check-email?email=existing@example.com')
      .expect(200);
    const unknownEmailResponse = await request(app.getHttpServer())
      .get('/auth/check-email?email=unknown@example.com')
      .expect(200);

    expect(existingEmailResponse.body).toEqual(unknownEmailResponse.body);
    expect(existingEmailResponse.body).not.toHaveProperty('isValid');
  });

  it('sets login cookies and returns tokens for mobile clients', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPass1!' })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some(cookie => cookie.startsWith('access_token='))).toBe(
      true,
    );
    expect(setCookie.some(cookie => cookie.startsWith('refresh_token='))).toBe(
      true,
    );
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body.tokens).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(response.body.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      role: GLOBAL_ROLES.USER,
    });
  });

  it('sets refresh cookies and returns tokens for mobile clients', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-token' })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some(cookie => cookie.startsWith('access_token='))).toBe(
      true,
    );
    expect(setCookie.some(cookie => cookie.startsWith('refresh_token='))).toBe(
      true,
    );
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body.tokens).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(response.body.success).toBe(true);
  });

  it('limits repeated login attempts', async () => {
    const responses = await postUntilLimited(
      '/auth/login',
      { email: 'test@example.com', password: 'WrongPass1!' },
      31,
    );

    expect(responses.some(res => res.status === 429)).toBe(true);
  });

  it('limits repeated email availability probes', async () => {
    const responses = await getUntilLimited(
      '/auth/check-email?email=test@example.com',
      6,
    );

    expect(responses.some(res => res.status === 429)).toBe(true);
  });

  it('limits repeated OTP verification attempts', async () => {
    const responses = await postUntilLimited(
      '/auth/verify-otp',
      { email: 'test@example.com', otp: '123456' },
      6,
    );

    expect(responses.some(res => res.status === 429)).toBe(true);
  });

  it('limits repeated refresh attempts', async () => {
    const responses = await postUntilLimited(
      '/auth/refresh',
      { refreshToken: 'refresh-token' },
      31,
    );

    expect(responses.some(res => res.status === 429)).toBe(true);
  });

  it('limits repeated password reset requests', async () => {
    const responses = await postUntilLimited(
      '/auth/request-password-reset',
      { email: 'test@example.com' },
      4,
    );

    expect(responses.some(res => res.status === 429)).toBe(true);
  });
});
