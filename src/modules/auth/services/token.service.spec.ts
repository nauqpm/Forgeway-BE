import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { UsersService } from '../../users/services/users.service';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const tokenModel = {
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
    findOne: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const usersService = {
    getUserById: jest.fn(),
  };

  const auditLogService = {
    log: jest.fn(),
  };

  const authTokenConfig = {
    refreshTokenSecret: 'refresh-secret',
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    getAccessTokenExpiresAt: jest.fn(
      () => new Date('2026-07-09T10:15:00.000Z'),
    ),
    getRefreshTokenExpiresAt: jest.fn(
      () => new Date('2026-07-16T10:00:00.000Z'),
    ),
  };

  let service: TokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenService(
      tokenModel as never,
      jwtService as unknown as JwtService,
      authTokenConfig as unknown as AuthTokenConfigService,
      usersService as unknown as UsersService,
      auditLogService as unknown as AuditLogService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('token pair issuance', () => {
    it('creates access and refresh tokens with jti and stores only hashes', async () => {
      jwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      tokenModel.create.mockResolvedValue({});

      const result = await service.createAndSaveTokens(
        'account-b',
        'b@example.com',
        'user',
        'Account B',
        'avatar.png',
        'account-a',
      );

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'account-b',
          email: 'b@example.com',
          role: 'user',
          fullName: 'Account B',
          avatar: 'avatar.png',
          rootUserId: 'account-a',
          type: TOKEN_TYPES.ACCESS,
          jti: expect.any(String),
        }),
      );
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'account-b',
          rootUserId: 'account-a',
          type: TOKEN_TYPES.REFRESH,
          jti: expect.any(String),
        }),
        expect.objectContaining({
          secret: authTokenConfig.refreshTokenSecret,
          expiresIn: authTokenConfig.refreshTokenTtlSeconds,
        }),
      );
      expect(tokenModel.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'account-b',
          email: 'b@example.com',
          role: 'user',
          token: service.hashToken('access-token'),
          status: true,
          type: TOKEN_TYPES.ACCESS,
          expiresAt: new Date('2026-07-09T10:15:00.000Z'),
        }),
      );
      expect(tokenModel.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'account-b',
          email: 'b@example.com',
          token: service.hashToken('refresh-token'),
          status: true,
          type: TOKEN_TYPES.REFRESH,
          familyId: expect.any(String),
          expiresAt: new Date('2026-07-16T10:00:00.000Z'),
        }),
      );
      expect(tokenModel.create.mock.calls[0][0].token).not.toBe('access-token');
      expect(tokenModel.create.mock.calls[1][0].token).not.toBe(
        'refresh-token',
      );
    });

    it('does not include rootUserId for direct-login token issuance', async () => {
      jwtService.sign
        .mockReturnValueOnce('direct-access-token')
        .mockReturnValueOnce('direct-refresh-token');
      tokenModel.create.mockResolvedValue({});

      await service.createAndSaveTokens('account-a', 'a@example.com', 'user');

      const accessPayload = jwtService.sign.mock.calls[0][0];
      const refreshPayload = jwtService.sign.mock.calls[1][0];

      expect(accessPayload.rootUserId).toBeUndefined();
      expect(refreshPayload.rootUserId).toBeUndefined();
      expect(accessPayload.jti).toEqual(expect.any(String));
      expect(refreshPayload.jti).toEqual(expect.any(String));
    });

    it('peeks rootUserId from access tokens before falling back to userId', () => {
      jwtService.verify
        .mockReturnValueOnce({
          userId: 'account-b',
          rootUserId: 'account-a',
          type: TOKEN_TYPES.ACCESS,
        })
        .mockReturnValueOnce({
          userId: 'account-a',
          type: TOKEN_TYPES.ACCESS,
        });

      expect(service.peekUserIdFromAccessToken('switched-token')).toBe(
        'account-a',
      );
      expect(service.peekUserIdFromAccessToken('direct-token')).toBe(
        'account-a',
      );
    });
  });

  describe('refresh token rotation', () => {
    const setupSuccessfulRefresh = () => {
      jwtService.verify.mockReturnValue({
        userId: 'account-b',
        rootUserId: 'account-a',
        type: TOKEN_TYPES.REFRESH,
      });
      tokenModel.findOneAndUpdate.mockResolvedValue({
        familyId: 'family-1',
        updatedAt: new Date('2026-07-09T10:00:00.000Z'),
        userId: 'account-b',
      });
      usersService.getUserById.mockResolvedValue({
        _id: { toString: () => 'account-b' },
        email: 'b@example.com',
        role: 'user',
        fullName: 'Account B',
        avatar: 'avatar.png',
      });
      tokenModel.updateMany.mockResolvedValue({});
      tokenModel.create.mockResolvedValue({});
      jwtService.sign
        .mockReturnValueOnce('rotated-access-token')
        .mockReturnValueOnce('rotated-refresh-token');
    };

    it('consumes old refresh token, revokes old access tokens, and creates rotated tokens', async () => {
      setupSuccessfulRefresh();

      const result = await service.refreshAccessToken('refresh-token');

      expect(result).toEqual({
        success: true,
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
      });
      expect(tokenModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          token: service.hashToken('refresh-token'),
          status: true,
          type: TOKEN_TYPES.REFRESH,
        },
        { $set: { status: false } },
        { new: false },
      );
      expect(tokenModel.updateMany).toHaveBeenCalledWith(
        { userId: 'account-b', type: TOKEN_TYPES.ACCESS, status: true },
        { $set: { status: false } },
      );
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'account-b',
          rootUserId: 'account-a',
          type: TOKEN_TYPES.ACCESS,
          jti: expect.any(String),
        }),
      );
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'account-b',
          rootUserId: 'account-a',
          type: TOKEN_TYPES.REFRESH,
          jti: expect.any(String),
        }),
        expect.any(Object),
      );
      expect(tokenModel.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          token: service.hashToken('rotated-refresh-token'),
          type: TOKEN_TYPES.REFRESH,
          familyId: 'family-1',
        }),
      );
    });

    it('logs refresh reuse inside grace window without revoking the token family', async () => {
      jest.useFakeTimers().setSystemTime(
        new Date('2026-07-09T10:00:10.000Z'),
      );
      jwtService.verify.mockReturnValue({
        userId: 'account-b',
        type: TOKEN_TYPES.REFRESH,
      });
      tokenModel.findOneAndUpdate.mockResolvedValue(null);
      tokenModel.findOne.mockResolvedValue({
        familyId: 'family-1',
        userId: 'account-b',
        updatedAt: new Date('2026-07-09T10:00:00.000Z'),
      });

      await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SECURITY_EVENT_TYPES.REFRESH_REUSED,
          severity: 'WARN',
          userId: 'account-b',
          metadata: expect.objectContaining({
            familyId: 'family-1',
            withinGrace: true,
          }),
        }),
      );
      expect(tokenModel.updateMany).not.toHaveBeenCalledWith(
        { familyId: 'family-1', status: true },
        { $set: { status: false } },
      );
    });

    it('revokes token family when a refresh token is reused outside grace window', async () => {
      jest.useFakeTimers().setSystemTime(
        new Date('2026-07-09T10:00:20.000Z'),
      );
      jwtService.verify.mockReturnValue({
        userId: 'account-b',
        type: TOKEN_TYPES.REFRESH,
      });
      tokenModel.findOneAndUpdate.mockResolvedValue(null);
      tokenModel.findOne.mockResolvedValue({
        familyId: 'family-1',
        userId: 'account-b',
        updatedAt: new Date('2026-07-09T10:00:00.000Z'),
      });
      tokenModel.updateMany.mockResolvedValue({});

      await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(tokenModel.updateMany).toHaveBeenCalledWith(
        { familyId: 'family-1', status: true },
        { $set: { status: false } },
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SECURITY_EVENT_TYPES.TOKEN_FAMILY_REVOKED,
          severity: 'CRITICAL',
          userId: 'account-b',
          metadata: expect.objectContaining({ familyId: 'family-1' }),
        }),
      );
    });
  });

  describe('token revocation', () => {
    it('revokes access and refresh session tokens by hash', async () => {
      tokenModel.updateMany.mockResolvedValue({});

      const result = await service.revokeSessionTokens('access-token', 'refresh-token');

      expect(result.message).toContain('thành công');

      expect(tokenModel.updateMany).toHaveBeenCalledWith(
        {
          token: {
            $in: [
              service.hashToken('access-token'),
              service.hashToken('refresh-token'),
            ],
          },
        },
        { status: false },
      );
    });

    it('rejects revokeSessionTokens when both tokens are missing', async () => {
      await expect(service.revokeSessionTokens()).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('invalidates one token by hash', async () => {
      tokenModel.updateOne.mockResolvedValue({});

      await service.invalidateToken('access-token');

      expect(tokenModel.updateOne).toHaveBeenCalledWith(
        { token: service.hashToken('access-token') },
        { status: false },
      );
    });

    it('invalidates all tokens for a user', async () => {
      tokenModel.updateMany.mockResolvedValue({});

      await service.invalidateAllTokensForUser('account-a');

      expect(tokenModel.updateMany).toHaveBeenCalledWith(
        { userId: 'account-a' },
        { status: false },
      );
    });
  });

  describe('password reset grant', () => {
    it('creates a hashed reset grant with expiry', async () => {
      tokenModel.create.mockResolvedValue({});

      const result = await service.createResetGrant('account-a', 'a@test.com');

      expect(result.resetGrant).toEqual(expect.any(String));
      expect(result.expiresInMs).toBe(10 * 60 * 1000);
      expect(tokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'account-a',
          email: 'a@test.com',
          token: service.hashToken(result.resetGrant),
          deviceInfo: 'Password Reset Grant',
          status: true,
          type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
          expiresAt: expect.any(Date),
        }),
      );
      expect(tokenModel.create.mock.calls[0][0].token).not.toBe(
        result.resetGrant,
      );
    });

    it('consumes an active reset grant', async () => {
      tokenModel.findOneAndUpdate.mockResolvedValue({ email: 'a@test.com' });

      await expect(service.consumeResetGrant('grant')).resolves.toEqual({
        email: 'a@test.com',
      });
      expect(tokenModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          token: service.hashToken('grant'),
          status: true,
          type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
          expiresAt: { $gt: expect.any(Date) },
        },
        { $set: { status: false } },
        { new: false },
      );
    });

    it('validates an active reset grant without consuming it', async () => {
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ email: 'a@test.com' }),
      });

      await expect(service.validateResetGrant('grant')).resolves.toEqual({
        email: 'a@test.com',
      });
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: service.hashToken('grant'),
        status: true,
        type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
        expiresAt: { $gt: expect.any(Date) },
      });
      expect(tokenModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects empty reset grants', async () => {
      await expect(service.consumeResetGrant('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validateResetGrant('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid, expired, or reused reset grants', async () => {
      tokenModel.findOneAndUpdate.mockResolvedValue(null);
      tokenModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.consumeResetGrant('grant')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateResetGrant('grant')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('token lookup', () => {
    it('finds active access token by hash', async () => {
      const tokenDoc = { token: 'hashed' };
      tokenModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(tokenDoc) });

      await expect(service.findActiveAccessToken('access-token')).resolves.toBe(
        tokenDoc,
      );
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: service.hashToken('access-token'),
        status: true,
        type: TOKEN_TYPES.ACCESS,
      });
    });

    it('finds active refresh token by hash', async () => {
      const tokenDoc = { token: 'hashed' };
      tokenModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(tokenDoc) });

      await expect(
        service.findActiveRefreshToken('refresh-token'),
      ).resolves.toBe(tokenDoc);
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: service.hashToken('refresh-token'),
        status: true,
        type: TOKEN_TYPES.REFRESH,
      });
    });

    it('finds legacy token by hash', async () => {
      const tokenDoc = { token: 'hashed' };
      tokenModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(tokenDoc) });

      await expect(service.findToken('token')).resolves.toBe(tokenDoc);
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: service.hashToken('token'),
        status: true,
      });
    });
  });
});