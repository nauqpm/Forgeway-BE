import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { App } from 'supertest/types';

jest.mock('../utils/cookie.utils', () => ({
  setAuthCookies: jest.fn(),
}));

import * as cookieUtils from '../utils/cookie.utils';
import { AccountSwitcherController } from './account-switcher.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { TokenService } from '../services/token.service';
import { AccountSwitcherService } from '../services/account-switcher.service';
import { AuditLogService } from '../../audit/services/audit-log.service';

describe('AccountSwitcherController', () => {
  let app: INestApplication<App>;

  const tokenServiceMock = {
    findActiveAccessToken: jest.fn(),
  };

  const accountSwitcherServiceMock = {
    listSavedAccounts: jest.fn(),
    switchToAccount: jest.fn(),
    forgetAccount: jest.fn(),
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

  const jwtServiceMock = {
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AccountSwitcherController],
      providers: [
        JwtAuthGuard,
        { provide: TokenService, useValue: tokenServiceMock },
        {
          provide: AccountSwitcherService,
          useValue: accountSwitcherServiceMock,
        },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
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

  const authenticateAsSwitchedSession = () => {
    jwtServiceMock.verify.mockReturnValue({
      userId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      rootUserId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      email: 'b@example.com',
      role: 'user',
      type: 'access',
    });
    tokenServiceMock.findActiveAccessToken.mockResolvedValue({
      userId: { toString: () => 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    });
  };

  it(
    'lists switchable accounts for the root owner instead of the acting switched user',
    async () => {
    authenticateAsSwitchedSession();
    accountSwitcherServiceMock.listSavedAccounts.mockResolvedValue([
      {
        accountId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        email: 'b@example.com',
        role: 'user',
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/auth/accounts')
      .set('Cookie', 'access_token=valid-token')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(accountSwitcherServiceMock.listSavedAccounts).toHaveBeenCalledWith(
      'aaaaaaaaaaaaaaaaaaaaaaaa',
    );
    },
    15_000,
  );

  it('switches using the root owner and returns rootUser in the response', async () => {
    authenticateAsSwitchedSession();
    accountSwitcherServiceMock.switchToAccount.mockResolvedValue({
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
      user: {
        id: 'cccccccccccccccccccccccc',
        email: 'c@example.com',
        role: 'user',
        rootUser: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/accounts/switch')
      .set('Cookie', [
        'access_token=valid-token',
        'refresh_token=refresh-token',
      ])
      .send({ accountId: 'cccccccccccccccccccccccc' })
      .expect(200);

    expect(accountSwitcherServiceMock.switchToAccount).toHaveBeenCalledWith(
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      'cccccccccccccccccccccccc',
      expect.objectContaining({ ownerRefreshToken: 'refresh-token' }),
    );
    expect(cookieUtils.setAuthCookies).toHaveBeenCalledWith(
      expect.anything(),
      configServiceMock,
      {
        accessToken: 'next-access-token',
        refreshToken: 'next-refresh-token',
      },
    );
    expect(response.body.user.rootUser).toEqual({
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('forgets accounts against the root owner list', async () => {
    authenticateAsSwitchedSession();
    accountSwitcherServiceMock.forgetAccount.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/auth/accounts/cccccccccccccccccccccccc')
      .set('Cookie', 'access_token=valid-token')
      .expect(200);

    expect(accountSwitcherServiceMock.forgetAccount).toHaveBeenCalledWith(
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      'cccccccccccccccccccccccc',
    );
  });
});
