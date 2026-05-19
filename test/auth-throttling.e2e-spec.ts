import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request = require('supertest');
import { App } from 'supertest/types';

import { AuthController } from '../src/modules/auth/controllers/auth.controller';
import { PasswordController } from '../src/modules/auth/controllers/password.controller';
import { AuthenticationService } from '../src/modules/auth/services/authentication.service';
import { AuditLogService } from '../src/modules/auth/services/audit-log.service';
import { PasswordResetService } from '../src/modules/auth/services/password-reset.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { UsersService } from '../src/modules/users/services/users.service';
import { GLOBAL_ROLES } from '../src/common/constants/global-role.constants';

describe('Auth throttling (e2e)', () => {
  let app: INestApplication<App>;

  const authenticationServiceMock = {
    login: jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      user: { id: 'user-1', email: 'test@example.com', role: GLOBAL_ROLES.USER },
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
  };

  const passwordResetServiceMock = {
    requestPasswordReset: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    verifyOtp: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    resetPasswordWithToken: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    resetPasswordWithOtp: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 120 },
        ]),
      ],
      controllers: [AuthController, PasswordController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: PasswordResetService, useValue: passwordResetServiceMock },
        { provide: UsersService, useValue: { getUserById: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)) },
        },
        { provide: AuditLogService, useValue: { log: jest.fn(), logRequest: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn(), sign: jest.fn() } },
        { provide: TokenService, useValue: tokenServiceMock },
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

  async function postUntilLimited(path: string, body: Record<string, unknown>, attempts: number) {
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

  it('sets login cookies without returning raw tokens in the response body', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPass1!' })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((cookie) => cookie.startsWith('access_token='))).toBe(true);
    expect(setCookie.some((cookie) => cookie.startsWith('refresh_token='))).toBe(true);
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).not.toHaveProperty('tokens');
    expect(response.body.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      role: GLOBAL_ROLES.USER,
    });
  });

  it('sets refresh cookies without returning raw tokens in the response body', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-token' })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((cookie) => cookie.startsWith('access_token='))).toBe(true);
    expect(setCookie.some((cookie) => cookie.startsWith('refresh_token='))).toBe(true);
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).not.toHaveProperty('tokens');
    expect(response.body.success).toBe(true);
  });

  it('limits repeated login attempts', async () => {
    const responses = await postUntilLimited(
      '/auth/login',
      { email: 'test@example.com', password: 'WrongPass1!' },
      6,
    );

    expect(responses.some((res) => res.status === 429)).toBe(true);
  });

  it('limits repeated email availability probes', async () => {
    const responses = await getUntilLimited(
      '/auth/check-email?email=test@example.com',
      6,
    );

    expect(responses.some((res) => res.status === 429)).toBe(true);
  });

  it('limits repeated OTP verification attempts', async () => {
    const responses = await postUntilLimited(
      '/auth/verify-otp',
      { email: 'test@example.com', otp: '123456' },
      6,
    );

    expect(responses.some((res) => res.status === 429)).toBe(true);
  });

  it('limits repeated refresh attempts', async () => {
    const responses = await postUntilLimited(
      '/auth/refresh',
      { refreshToken: 'refresh-token' },
      31,
    );

    expect(responses.some((res) => res.status === 429)).toBe(true);
  });

  it('limits repeated password reset requests', async () => {
    const responses = await postUntilLimited(
      '/auth/request-password-reset',
      { email: 'test@example.com', resetMethod: 'otp' },
      4,
    );

    expect(responses.some((res) => res.status === 429)).toBe(true);
  });
});
