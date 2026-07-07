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
import { SavedAccount } from '../schemas/saved-account.schema';
import { LoginAttemptThrottleService } from '../security/login-attempt-throttle.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AccountSwitchTargetAuthService } from '../services/account-switch-target-auth.service';
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
    findOne: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn(),
  };
  const usersService = {
    getUserById: jest.fn(),
  };
  const passwordService = {
    verifyPassword: jest.fn(),
  };
  const tokenService = {
    createAndSaveTokens: jest.fn(),
    revokeSessionTokens: jest.fn(),
  };
  const loginAttemptThrottleService = {
    getRetryAfterSeconds: jest.fn(),
    registerFailure: jest.fn(),
    clear: jest.fn(),
  };
  const auditLogService = {
    logRequest: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    savedAccountModel.findOne.mockResolvedValue({ _id: savedEntryId });
    savedAccountModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    savedAccountModel.countDocuments.mockResolvedValue(1);
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
    tokenService.revokeSessionTokens.mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AccountSwitcherController],
      providers: [
        AccountSwitcherService,
        AccountSwitchTargetAuthService,
        {
          provide: getModelToken(SavedAccount.name),
          useValue: savedAccountModel,
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

  it('does not let a saved B to C entry mint tokens when the target password is wrong', async () => {
    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
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
  });

  it('verifies the correct target password before minting target tokens', async () => {
    passwordService.verifyPassword.mockResolvedValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('x-forwarded-for', '203.0.113.10')
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
        credential: { type: 'mfa_otp', password: 'wrong' },
      })
      .expect(400);

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
});
