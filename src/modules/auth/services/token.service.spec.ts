import { JwtService } from '@nestjs/jwt';

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

  it('creates switched access and refresh tokens with rootUserId', async () => {
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    tokenModel.create.mockResolvedValue({});

    await service.createAndSaveTokens(
      'account-b',
      'b@example.com',
      'user',
      'Account B',
      'avatar.png',
      'account-a',
    );

    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 'account-b',
        rootUserId: 'account-a',
        type: TOKEN_TYPES.ACCESS,
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
    expect(service.peekUserIdFromAccessToken('direct-token')).toBe('account-a');
  });

  it('preserves rootUserId when refreshing a switched session', async () => {
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

    const result = await service.refreshAccessToken('refresh-token');

    expect(result).toEqual({
      success: true,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    });
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 'account-b',
        rootUserId: 'account-a',
        type: TOKEN_TYPES.ACCESS,
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
  });
});
