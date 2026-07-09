import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import { Types } from 'mongoose';
import request = require('supertest');
import { App } from 'supertest/types';

import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { UsersService } from '../../users/services/users.service';
import { ParkedSession } from '../schemas/parked-session.schema';
import { SavedAccount } from '../schemas/saved-account.schema';
import { LoginAttemptThrottleService } from '../security/login-attempt-throttle.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AccountSwitchTargetAuthService } from '../services/account-switch-target-auth.service';
import { AccountSwitchSsoService } from '../services/account-switch-sso.service';
import { AccountSwitchSecurityAlertService } from '../services/account-switch-security-alert.service';
import { AccountSwitcherService } from '../services/account-switcher.service';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { AccountSwitcherController } from './account-switcher.controller';

describe('AccountSwitcherController', () => {
  let app: INestApplication<App>;

  const ownerUserId = new Types.ObjectId().toString();
  const targetAccountId = new Types.ObjectId().toString();
  const savedEntryId = new Types.ObjectId();
  const savedAccountModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn(),
  };
  const parkedSessionModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    deleteMany: jest.fn(),
    deleteOne: jest.fn(),
  };
  const usersService = {
    getUserById: jest.fn(),
  };
  const passwordService = {
    verifyPassword: jest.fn(),
  };
  const accountSwitchSsoService = {
    initSwitch: jest.fn(),
    completeSwitch: jest.fn(),
  };
  const accountSwitchSecurityAlertService = {
    sendTargetLockoutEmail: jest.fn(),
  };
  const tokenService = {
    createAndSaveTokens: jest.fn(),
    hashToken: jest.fn(),
    revokeSessionTokens: jest.fn(),
    rotateRefreshTokenByHash: jest.fn(),
  };
  const loginAttemptThrottleService = {
    getRetryAfterSeconds: jest.fn(),
    registerFailure: jest.fn(),
    clear: jest.fn(),
  };
  const auditLogService = {
    log: jest.fn(),
    logRequest: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        NODE_ENV: 'test',
        ACCOUNT_SWITCHER_ENABLED: 'true',
      };
      return values[key];
    });
    savedAccountModel.findOne.mockResolvedValue({ _id: savedEntryId });
    savedAccountModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    savedAccountModel.countDocuments.mockResolvedValue(1);
    parkedSessionModel.findOne.mockResolvedValue(null);
    parkedSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    parkedSessionModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
    parkedSessionModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
    usersService.getUserById.mockImplementation((id: string) => {
      if (id === targetAccountId) {
        return Promise.resolve({
          _id: { toString: () => targetAccountId },
          email: 'target@example.com',
          password: 'hashed-correct-password',
          role: 'user',
          status: USER_STATUSES.ACTIVE,
        });
      }

      if (id === ownerUserId) {
        return Promise.resolve({
          _id: { toString: () => ownerUserId },
          email: 'owner@example.com',
          password: 'owner-hashed-password',
          role: 'user',
          status: USER_STATUSES.ACTIVE,
        });
      }

      return Promise.resolve(null);
    });
    passwordService.verifyPassword.mockResolvedValue(false);
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValue(0);
    loginAttemptThrottleService.registerFailure.mockResolvedValue({
      emailAttempts: 1,
      ipAttempts: 1,
      retryAfterSeconds: 0,
    });
    loginAttemptThrottleService.clear.mockResolvedValue(undefined);
    tokenService.createAndSaveTokens.mockResolvedValue({
      accessToken: 'target-access-token',
      refreshToken: 'target-refresh-token',
    });
    tokenService.hashToken.mockImplementation((token: string) => `hash:${token}`);
    tokenService.revokeSessionTokens.mockResolvedValue(undefined);
    tokenService.rotateRefreshTokenByHash.mockResolvedValue({
      success: true,
      accessToken: 'target-access-token',
      refreshToken: 'target-refresh-token',
      user: {
        id: targetAccountId,
        email: 'target@example.com',
        role: 'user',
      },
    });
    accountSwitchSsoService.initSwitch.mockResolvedValue({
      authorizationUrl:
        'https://accounts.google.com/o/oauth2/v2/auth?prompt=login&state=signed-state',
    });
    accountSwitchSsoService.completeSwitch.mockResolvedValue({
      accessToken: 'target-access-token',
      refreshToken: 'target-refresh-token',
      actorUserId: ownerUserId,
      targetAccountId,
      currentPageUrl: 'http://localhost:3000/workspace/projects',
      user: {
        id: targetAccountId,
        email: 'target@example.com',
        role: 'user',
      },
    });
    accountSwitchSecurityAlertService.sendTargetLockoutEmail.mockResolvedValue(
      true,
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AccountSwitcherController],
      providers: [
        AccountSwitcherService,
        AccountSwitchTargetAuthService,
        { provide: AccountSwitchSsoService, useValue: accountSwitchSsoService },
        {
          provide: AccountSwitchSecurityAlertService,
          useValue: accountSwitchSecurityAlertService,
        },
        {
          provide: getModelToken(SavedAccount.name),
          useValue: savedAccountModel,
        },
        {
          provide: getModelToken(ParkedSession.name),
          useValue: parkedSessionModel,
        },
        { provide: UsersService, useValue: usersService },
        { provide: PasswordService, useValue: passwordService },
        { provide: TokenService, useValue: tokenService },
        { provide: ConfigService, useValue: configService },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: LoginAttemptThrottleService,
          useValue: loginAttemptThrottleService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: context => {
          const req = context.switchToHttp().getRequest();
          req.user = { userId: ownerUserId, email: 'owner@example.com' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects switch without target credential before minting target tokens', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({ accountId: targetAccountId })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('switches a parked account without asking for the target password', async () => {
    parkedSessionModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      refreshTokenHash: 'target-refresh-hash',
    });

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('Cookie', ['device_id=device-123', 'refresh_token=owner-refresh'])
      .send({
        accountId: targetAccountId,
        credential: { type: 'parked' },
      })
      .expect(200);

    expect(tokenService.rotateRefreshTokenByHash).toHaveBeenCalledWith(
      'target-refresh-hash',
      targetAccountId,
    );
    expect(tokenService.revokeSessionTokens).toHaveBeenCalledWith(
      undefined,
      'owner-refresh',
    );
    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
    expect(parkedSessionModel.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.objectContaining({
        $set: expect.objectContaining({
          refreshTokenHash: 'hash:target-refresh-token',
          lastUsedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('returns REAUTH_REQUIRED when parked switch has no active refresh token', async () => {
    parkedSessionModel.findOne.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('Cookie', 'device_id=device-123')
      .send({
        accountId: targetAccountId,
        credential: { type: 'parked' },
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('returns REAUTH_REQUIRED for a suspended parked target before rotating refresh token', async () => {
    parkedSessionModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      refreshTokenHash: 'target-refresh-hash',
    });
    usersService.getUserById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: { toString: () => targetAccountId },
        email: 'target@example.com',
        password: 'hashed-correct-password',
        role: 'user',
        status: 'suspended',
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('Cookie', 'device_id=device-123')
      .send({
        accountId: targetAccountId,
        credential: { type: 'parked' },
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(parkedSessionModel.deleteOne).toHaveBeenCalledWith({
      _id: expect.any(Types.ObjectId),
    });
    expect(tokenService.rotateRefreshTokenByHash).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects a parked credential that supplies extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'parked', password: '123' },
      })
      .expect(400);
  });

  it('starts SSO switch with a backend-generated authorization URL', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/accounts/switch/sso/init')
      .set('Cookie', 'device_id=device-123')
      .send({
        targetAccountId,
        currentPageUrl: 'http://localhost:3000/workspace/projects',
      })
      .expect(200);

    expect(response.body).toEqual({
      authorizationUrl:
        'https://accounts.google.com/o/oauth2/v2/auth?prompt=login&state=signed-state',
    });
    expect(accountSwitchSsoService.initSwitch).toHaveBeenCalledWith(
      ownerUserId,
      targetAccountId,
      {
        deviceId: 'device-123',
        currentPageUrl: 'http://localhost:3000/workspace/projects',
      },
    );
  });

  it('ignores client supplied SSO prompt and redirect overrides on init', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch/sso/init')
      .set('Cookie', 'device_id=device-123')
      .send({
        targetAccountId,
        currentPageUrl: 'http://localhost:3000/workspace/projects',
        prompt: 'none',
        redirect_uri: 'https://evil.example/callback',
      })
      .expect(200);

    expect(accountSwitchSsoService.initSwitch).toHaveBeenCalledWith(
      ownerUserId,
      targetAccountId,
      {
        deviceId: 'device-123',
        currentPageUrl: 'http://localhost:3000/workspace/projects',
      },
    );
  });

  it('completes SSO switch, sets target cookies, and redirects to the stored page', async () => {
    await request(app.getHttpServer())
      .get('/auth/accounts/switch/sso/callback?state=signed-state&code=auth-code')
      .set('Cookie', 'device_id=device-123')
      .expect(302)
      .expect('Location', 'http://localhost:3000/workspace/projects');

    expect(accountSwitchSsoService.completeSwitch).toHaveBeenCalledWith(
      'signed-state',
      'auth-code',
      { deviceId: 'device-123' },
    );
    expect(auditLogService.logRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'ACCOUNT_SWITCH_SUCCESS',
        metadata: expect.objectContaining({
          triggeredVia: 'account-switch',
          actorUserId: ownerUserId,
          toUserId: targetAccountId,
          reauthMethod: 'sso',
          outcome: 'success',
        }),
      }),
    );
    const successAuditPayload = auditLogService.logRequest.mock.calls[0][1];
    expect(successAuditPayload.metadata).not.toHaveProperty('switchChainId');
  });

  it('rejects silent SSO callbacks before minting target tokens', async () => {
    await request(app.getHttpServer())
      .get(
        '/auth/accounts/switch/sso/callback?state=signed-state&code=auth-code&prompt=none',
      )
      .set('Cookie', 'device_id=device-123')
      .expect(400);

    expect(accountSwitchSsoService.completeSwitch).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it.todo(
    'rejects SSO init rate limit exceeded with 429 (covered by Nest throttler integration)',
  );

  it.todo(
    'MFA init for TOTP target -> 400, no OTP sent (blocked: no MFA target model yet)',
  );

  it.todo(
    'MFA init for email/SMS target -> sends OTP to C with a generic response (blocked: no MFA target model yet)',
  );

  it.todo(
    'MFA init without saved B -> C entry -> failure, no OTP sent (blocked: no MFA target model yet)',
  );

  it.todo(
    'MFA init rate limit exceeded -> 429 (blocked: no MFA target model yet)',
  );

  it.todo(
    'OTP verification uses the same active challenge created by init and requires password + OTP (blocked: no MFA target model yet)',
  );

  it('fails closed before credential checks when account switching is disabled', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        NODE_ENV: 'test',
        ACCOUNT_SWITCHER_ENABLED: 'false',
      };
      return values[key];
    });

    const response = await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'correct-password' },
      })
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    expect(savedAccountModel.findOne).not.toHaveBeenCalled();
    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
    expect(auditLogService.logRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'ACCOUNT_SWITCH_DISABLED',
        metadata: expect.objectContaining({
          triggeredVia: 'account-switch',
          actorUserId: ownerUserId,
          fromUserId: ownerUserId,
          toUserId: targetAccountId,
          outcome: 'disabled',
          reason: expect.stringContaining('FEATURE_DISABLED'),
        }),
      }),
    );
    const disabledAuditPayload = auditLogService.logRequest.mock.calls[0][1];
    expect(disabledAuditPayload.metadata).not.toHaveProperty('switchChainId');
    expect(disabledAuditPayload.metadata).not.toHaveProperty('reauthMethod');
  });

  it('does not let a saved B to C entry mint tokens when the target password is wrong', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
      .set('user-agent', 'switch-test-agent')
      .set('Cookie', 'device_id=device-123')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'wrong' },
      })
      .expect(401);

    expect(loginAttemptThrottleService.registerFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'target@example.com',
        ip: '203.0.113.10',
      }),
    );
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
    expect(auditLogService.logRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'ACCOUNT_SWITCH_FAILED',
        severity: 'WARN',
        metadata: expect.objectContaining({
          triggeredVia: 'account-switch',
          actorUserId: ownerUserId,
          fromUserId: ownerUserId,
          toUserId: targetAccountId,
          deviceId: 'device-123',
          ip: '203.0.113.10',
          userAgent: 'switch-test-agent',
          reauthMethod: 'password',
          outcome: 'failed',
          reason: expect.any(String),
        }),
      }),
    );
    const failedAuditPayload = auditLogService.logRequest.mock.calls[0][1];
    expect(failedAuditPayload.metadata).not.toHaveProperty('switchChainId');
  });

  it('verifies the correct target password before minting target tokens', async () => {
    passwordService.verifyPassword.mockResolvedValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
      .set('user-agent', 'switch-test-agent')
      .set('Cookie', 'device_id=device-123')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'correct-password' },
      })
      .expect(200);

    expect(passwordService.verifyPassword).toHaveBeenCalledWith(
      'correct-password',
      'hashed-correct-password',
    );
    expect(loginAttemptThrottleService.clear).toHaveBeenCalledWith({
      email: 'target@example.com',
      ip: '203.0.113.10',
    });
    expect(
      usersService.getUserById.mock.calls.filter(
        ([id]) => id === targetAccountId,
      ),
    ).toHaveLength(1);
    expect(tokenService.createAndSaveTokens).toHaveBeenCalledWith(
      targetAccountId,
      'target@example.com',
      'user',
      undefined,
      undefined,
    );
    expect(auditLogService.logRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'ACCOUNT_SWITCH_SUCCESS',
        severity: 'INFO',
        userId: targetAccountId,
        email: 'target@example.com',
        metadata: expect.objectContaining({
          triggeredVia: 'account-switch',
          actorUserId: ownerUserId,
          fromUserId: ownerUserId,
          toUserId: targetAccountId,
          deviceId: 'device-123',
          ip: '203.0.113.10',
          userAgent: 'switch-test-agent',
          reauthMethod: 'password',
          outcome: 'success',
          reason: 'SWITCH_COMPLETED',
        }),
      }),
    );
    const successAuditPayload = auditLogService.logRequest.mock.calls[0][1];
    expect(successAuditPayload.metadata).not.toHaveProperty('switchChainId');
  });

  it('rejects a locked target before verifying the password', async () => {
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValueOnce(30);

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'correct-password' },
      })
      .expect(429);

    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(loginAttemptThrottleService.registerFailure).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects an inactive target before verifying the password', async () => {
    usersService.getUserById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: { toString: () => targetAccountId },
        email: 'target@example.com',
        password: 'hashed-correct-password',
        role: 'user',
        status: USER_STATUSES.INACTIVE,
      }),
    );

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'correct-password' },
      })
      .expect(403);

    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(loginAttemptThrottleService.clear).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects an SSO-only target without counting it as a password failure', async () => {
    usersService.getUserById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: { toString: () => targetAccountId },
        email: 'target@example.com',
        password: null,
        role: 'user',
        status: USER_STATUSES.ACTIVE,
      }),
    );

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'wrong' },
      })
      .expect(400);

    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(loginAttemptThrottleService.registerFailure).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects an empty password credential before minting target tokens', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: '' },
      })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects empty password and otp credential fields before minting target tokens', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: '', otp: '' },
      })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects an unknown credential type before account lookup', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'magic_link', password: 'wrong' },
      })
      .expect(400);

    expect(savedAccountModel.findOne).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects a password credential that only supplies otp', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', otp: '123456' },
      })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects an mfa credential that only supplies password', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'mfa_full', password: 'wrong' },
      })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects an mfa credential that only supplies otp', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'mfa_full', otp: '123456' },
      })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects a credential type unsupported by the target without verifying password', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: {
          type: 'mfa_full',
          password: 'correct-password',
          otp: '123456',
        },
      })
      .expect(400);

    expect(savedAccountModel.findOne).toHaveBeenCalled();
    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(loginAttemptThrottleService.registerFailure).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects multiple credential fields before minting target tokens', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'wrong', otp: '123456' },
      })
      .expect(400);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects before target auth when the saved B to C entry is missing', async () => {
    savedAccountModel.findOne.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'wrong' },
      })
      .expect(403);

    expect(savedAccountModel.findOne).toHaveBeenCalledWith({
      ownerUserId: expect.any(Types.ObjectId),
      accountId: expect.any(Types.ObjectId),
    });
    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(loginAttemptThrottleService.registerFailure).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('locks the target after failed switch attempts and then rejects a correct password', async () => {
    passwordService.verifyPassword.mockResolvedValueOnce(false);
    loginAttemptThrottleService.getRetryAfterSeconds
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(30);
    loginAttemptThrottleService.registerFailure.mockResolvedValueOnce({
      emailAttempts: 5,
      ipAttempts: 1,
      retryAfterSeconds: 30,
    });

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'wrong' },
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
      .send({
        accountId: targetAccountId,
        credential: { type: 'password', password: 'correct-password' },
      })
      .expect(429);

    expect(passwordService.verifyPassword).toHaveBeenCalledTimes(1);
    expect(loginAttemptThrottleService.registerFailure).toHaveBeenCalledTimes(
      1,
    );
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

});
