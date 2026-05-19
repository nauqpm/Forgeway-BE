import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { Types } from 'mongoose';
import request = require('supertest');

import { GLOBAL_ROLES } from '../src/common/constants/global-role.constants';
import { AuthController } from '../src/modules/auth/controllers/auth.controller';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { Otp, OtpDocument } from '../src/modules/auth/schemas/otp.schema';
import { Token, TokenDocument } from '../src/modules/auth/schemas/token.schema';
import { AuditLogService } from '../src/modules/auth/services/audit-log.service';
import { OtpService } from '../src/modules/auth/services/otp.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { TOKEN_TYPES } from '../src/modules/auth/constants/token.constants';
import { AuthenticationService } from '../src/modules/auth/services/authentication.service';
import { UsersService } from '../src/modules/users/services/users.service';

type TokenRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  role?: string;
  token: string;
  deviceInfo: string;
  status: boolean;
  type: string;
  familyId?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryTokenModel {
  records: TokenRecord[] = [];

  async create(input: Partial<TokenRecord>): Promise<TokenRecord> {
    const now = new Date();
    const record: TokenRecord = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(String(input.userId)),
      email: input.email ?? '',
      role: input.role,
      token: input.token ?? '',
      deviceInfo: input.deviceInfo ?? 'Unknown',
      status: input.status ?? true,
      type: input.type ?? TOKEN_TYPES.ACCESS,
      familyId: input.familyId,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return record;
  }

  async updateMany(
    query: Record<string, unknown>,
    update: { $set: Partial<TokenRecord> } | Partial<TokenRecord>,
  ) {
    let modifiedCount = 0;
    const changes = '$set' in update ? update.$set : update;
    for (const record of this.records) {
      if (this.matches(record, query)) {
        Object.assign(record, changes, { updatedAt: new Date() });
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  }

  async updateOne(query: Record<string, unknown>, update: Partial<TokenRecord>) {
    const record = this.records.find((item) => this.matches(item, query));
    if (record) {
      Object.assign(record, update, { updatedAt: new Date() });
    }
    return { modifiedCount: record ? 1 : 0 };
  }

  findOne(query: Record<string, unknown>) {
    const resolve = async () =>
      this.records.find((record) => this.matches(record, query)) ?? null;
    return {
      exec: resolve,
      then: (onFulfilled: (value: TokenRecord | null) => unknown, onRejected?: (reason: unknown) => unknown) =>
        resolve().then(onFulfilled, onRejected),
    };
  }

  async findOneAndUpdate(
    query: Record<string, unknown>,
    update: { $set: Partial<TokenRecord> },
  ): Promise<TokenRecord | null> {
    const record = this.records.find((item) => this.matches(item, query));
    if (!record) {
      return null;
    }
    const before = { ...record };
    Object.assign(record, update.$set, { updatedAt: new Date() });
    return before;
  }

  private matches(record: TokenRecord, query: Record<string, unknown>): boolean {
    return Object.entries(query).every(([key, expected]) => {
      const value = record[key as keyof TokenRecord];
      if (expected && typeof expected === 'object' && '$in' in expected) {
        return (expected.$in as unknown[]).includes(value);
      }
      if (expected && typeof expected === 'object' && '$gt' in expected) {
        return value instanceof Date && value > (expected.$gt as Date);
      }
      if (key === 'userId') {
        return String(value) === String(expected);
      }
      return value === expected;
    });
  }
}

type OtpRecord = {
  _id: Types.ObjectId;
  email: string;
  code: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
};

class InMemoryOtpModel {
  records: OtpRecord[] = [];

  async create(input: Omit<OtpRecord, '_id' | 'createdAt'>): Promise<OtpRecord> {
    const record = { ...input, _id: new Types.ObjectId(), createdAt: new Date() };
    this.records.push(record);
    return record;
  }

  findOne(query: Partial<OtpRecord> & { expiresAt?: { $gt: Date } }) {
    return {
      sort: () => ({
        exec: async () =>
          [...this.records]
            .filter((record) => {
              const activeByExpiry = query.expiresAt?.$gt
                ? record.expiresAt > query.expiresAt.$gt
                : true;
              return (
                record.email === query.email &&
                record.isUsed === query.isUsed &&
                activeByExpiry
              );
            })
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      }),
    };
  }

  async updateOne(query: { _id: string }, update: Partial<OtpRecord>) {
    const record = this.records.find((item) => String(item._id) === query._id);
    if (record) {
      Object.assign(record, update);
    }
  }
}

describe('Auth security flows (integration)', () => {
  const userId = new Types.ObjectId().toString();
  const jwtService = new JwtService({ secret: 'jwt-secret-that-is-long-enough-for-tests' });
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'jwt-secret-that-is-long-enough-for-tests',
        REFRESH_TOKEN_SECRET: 'refresh-secret-that-is-long-enough',
        REFRESH_TOKEN_EXPIRES_IN: '7d',
        NODE_ENV: 'test',
      };
      return values[key];
    }),
  };

  let tokenModel: InMemoryTokenModel;
  let tokenService: TokenService;

  beforeEach(() => {
    tokenModel = new InMemoryTokenModel();
    tokenService = new TokenService(
      tokenModel as unknown as never,
      jwtService,
      configService as unknown as ConfigService,
      {
        getUserById: jest.fn().mockResolvedValue({
          _id: { toString: () => userId },
          email: 'user@example.com',
          role: GLOBAL_ROLES.USER,
          fullName: 'User',
          avatar: 'avatar.png',
        }),
      } as unknown as UsersService,
      { log: jest.fn() } as unknown as AuditLogService,
    );
  });

  it('rotates refresh tokens and revokes the family on reused old refresh token', async () => {
    const initial = await tokenService.createAndSaveTokens(
      userId,
      'user@example.com',
      GLOBAL_ROLES.USER,
    );
    const rotated = await tokenService.refreshAccessToken(initial.refreshToken);

    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    expect(
      tokenModel.records.find((record) => record.token === tokenService.hashToken(initial.refreshToken))
        ?.status,
    ).toBe(false);

    const oldRefresh = tokenModel.records.find(
      (record) => record.token === tokenService.hashToken(initial.refreshToken),
    );
    if (!oldRefresh) {
      throw new Error('Expected old refresh token record');
    }
    oldRefresh.updatedAt = new Date(Date.now() - 20_000);

    await expect(tokenService.refreshAccessToken(initial.refreshToken)).rejects.toThrow();
    const familyRecords = tokenModel.records.filter((record) => record.familyId === oldRefresh.familyId);
    expect(familyRecords.every((record) => record.status === false)).toBe(true);
  });

  it('consumes a password reset token exactly once', async () => {
    const rawToken = 'reset-token';
    await tokenService.createPasswordResetTokenRecord(userId, 'user@example.com', rawToken);

    const [first, second] = await Promise.all([
      tokenService.consumePasswordResetToken(rawToken),
      tokenService.consumePasswordResetToken(rawToken),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('accepts only active OTPs and excludes them after consume or expiry', async () => {
    const otpModel = new InMemoryOtpModel();
    const otpService = new OtpService(otpModel as unknown as never);

    await otpService.createOtp('user@example.com', '123456', 60_000);
    await otpService.verifyOtp('user@example.com', '123456');

    const activeOtp = await otpService.getLatestActiveOtp('user@example.com');
    expect(activeOtp).not.toBeNull();
    await otpService.markUsed(String(activeOtp?._id));
    expect(await otpService.getLatestActiveOtp('user@example.com')).toBeNull();

    await otpService.createOtp('expired@example.com', '654321', -1);
    await expect(otpService.verifyOtp('expired@example.com', '654321')).rejects.toThrow();
  });
});

describe('Auth logout revoke path (e2e)', () => {
  let app: INestApplication;
  let tokenModel: InMemoryTokenModel;
  let tokenService: TokenService;
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    tokenModel = new InMemoryTokenModel();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'jwt-secret-that-is-long-enough-for-tests' }),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                JWT_SECRET: 'jwt-secret-that-is-long-enough-for-tests',
                REFRESH_TOKEN_SECRET: 'refresh-secret-that-is-long-enough',
                REFRESH_TOKEN_EXPIRES_IN: '7d',
                NODE_ENV: 'test',
              };
              return values[key];
            }),
          },
        },
        {
          provide: getModelToken(Token.name),
          useValue: tokenModel,
        },
        {
          provide: UsersService,
          useValue: {
            getUserById: jest.fn(),
          },
        },
        {
          provide: AuthenticationService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
            logRequest: jest.fn(),
          },
        },
        TokenService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    tokenService = moduleRef.get(TokenService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('revokes access and refresh tokens supplied via cookies on logout', async () => {
    const tokens = await tokenService.createAndSaveTokens(
      userId,
      'user@example.com',
      GLOBAL_ROLES.USER,
    );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [
        `access_token=${tokens.accessToken}`,
        `refresh_token=${tokens.refreshToken}`,
      ])
      .expect(200);

    expect(
      tokenModel.records.filter((record) =>
        [tokenService.hashToken(tokens.accessToken), tokenService.hashToken(tokens.refreshToken)].includes(
          record.token,
        ),
      ).every((record) => record.status === false),
    ).toBe(true);
  });
});
