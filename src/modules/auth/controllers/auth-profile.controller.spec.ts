import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { App } from 'supertest/types';

import { AuthProfileController } from './auth-profile.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { TokenService } from '../services/token.service';
import { UsersService } from '../../users/services/users.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

describe('AuthProfileController', () => {
  let app: INestApplication<App>;

  const tokenServiceMock = {
    findActiveAccessToken: jest.fn(),
  };

  const usersServiceMock = {
    getUserById: jest.fn(),
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
      controllers: [AuthProfileController],
      providers: [
        JwtAuthGuard,
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
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

  describe('GET /auth/me', () => {
    const userProfile = {
      _id: 'user-1',
      email: 'user@example.com',
      fullName: 'Test User',
      role: GLOBAL_ROLES.USER,
      avatar: 'avatar.png',
    };

    it('returns user profile when authenticated', async () => {
      jwtServiceMock.verify.mockReturnValue({
        userId: 'user-1',
        email: 'user@example.com',
        role: GLOBAL_ROLES.USER,
        type: 'access',
      });
      tokenServiceMock.findActiveAccessToken.mockResolvedValue({
        userId: { toString: () => 'user-1' },
      });
      usersServiceMock.getUserById.mockResolvedValue(userProfile);

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', 'access_token=valid-token')
        .expect(200);

      expect(response.body).toEqual(userProfile);
    });

    it('returns 401 when not authenticated', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('No token');
      });

      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rejects unauthenticated requests without a token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });
});
