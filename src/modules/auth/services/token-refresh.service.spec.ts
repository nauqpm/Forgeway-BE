import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { UsersService } from '../../users/services/users.service';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { hashToken } from '../utils/token-hash.util';
import { TokenIssuerService } from './token-issuer.service';
import { TokenRefreshService } from './token-refresh.service';

describe('TokenRefreshService', () => {
  const tokenModel = {
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    findOne: jest.fn(),
  };

  const jwtService = {
    verify: jest.fn(),
  };

  const authTokenConfig = {
    refreshTokenSecret: 'refresh-secret',
    getAccessTokenExpiresAt: jest.fn(
      () => new Date('2026-07-09T10:15:00.000Z'),
    ),
    getRefreshTokenExpiresAt: jest.fn(
      () => new Date('2026-07-16T10:00:00.000Z'),
    ),
  };

  const usersService = {
    getUserById: jest.fn(),
  };

  const auditLogService = {
    log: jest.fn(),
  };

  const tokenIssuerService = {
    createAccessToken: jest.fn(),
    createRefreshToken: jest.fn(),
    saveAccessToken: jest.fn(),
    saveRefreshToken: jest.fn(),
  };

  let service: TokenRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenRefreshService(
      tokenModel as never,
      jwtService as unknown as JwtService,
      authTokenConfig as unknown as AuthTokenConfigService,
      usersService as unknown as UsersService,
      auditLogService as unknown as AuditLogService,
      tokenIssuerService as unknown as TokenIssuerService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
    tokenIssuerService.createAccessToken.mockReturnValue(
      'rotated-access-token',
    );
    tokenIssuerService.createRefreshToken.mockReturnValue(
      'rotated-refresh-token',
    );
    tokenIssuerService.saveAccessToken.mockResolvedValue(undefined);
    tokenIssuerService.saveRefreshToken.mockResolvedValue(undefined);
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
        token: hashToken('refresh-token'),
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
    expect(tokenIssuerService.createAccessToken).toHaveBeenCalledWith({
      userId: 'account-b',
      email: 'b@example.com',
      role: 'user',
      fullName: 'Account B',
      avatar: 'avatar.png',
      rootUserId: 'account-a',
    });
    expect(tokenIssuerService.createRefreshToken).toHaveBeenCalledWith({
      userId: 'account-b',
      rootUserId: 'account-a',
    });
    expect(tokenIssuerService.saveRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'rotated-refresh-token',
        familyId: 'family-1',
      }),
    );
  });

  it('warns and generates a fallback familyId for legacy refresh tokens without one', async () => {
    setupSuccessfulRefresh();
    tokenModel.findOneAndUpdate.mockResolvedValue({
      updatedAt: new Date('2026-07-09T10:00:00.000Z'),
      userId: 'account-b',
    });
    const warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.refreshAccessToken('refresh-token');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Consumed refresh token has no familyId'),
    );
    expect(tokenIssuerService.saveRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: expect.any(String),
      }),
    );
  });

  it('logs refresh reuse inside grace window without revoking the token family', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-09T10:00:10.000Z'));
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
    jest.useFakeTimers().setSystemTime(new Date('2026-07-09T10:00:20.000Z'));
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

  it('does not log expected UnauthorizedException as a system error', async () => {
    jwtService.verify.mockReturnValue({
      userId: 'account-b',
      type: TOKEN_TYPES.REFRESH,
    });
    tokenModel.findOneAndUpdate.mockResolvedValue(null);
    tokenModel.findOne.mockResolvedValue(null);
    const errorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('maps invalid refresh JWTs to UnauthorizedException', async () => {
    jwtService.verify.mockImplementation(() => {
      const error = new Error('invalid signature');
      error.name = 'JsonWebTokenError';
      throw error;
    });

    await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
