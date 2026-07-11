import { JwtService } from '@nestjs/jwt';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { hashToken } from '../utils/token-hash.util';
import { TokenIssuerService } from './token-issuer.service';

describe('TokenIssuerService', () => {
  const tokenModel = {
    create: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn(),
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

  let service: TokenIssuerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenIssuerService(
      tokenModel as never,
      jwtService as unknown as JwtService,
      authTokenConfig as unknown as AuthTokenConfigService,
    );
  });

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
        token: hashToken('access-token'),
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
        token: hashToken('refresh-token'),
        status: true,
        type: TOKEN_TYPES.REFRESH,
        familyId: expect.any(String),
        expiresAt: new Date('2026-07-16T10:00:00.000Z'),
      }),
    );
    expect(tokenModel.create.mock.calls[0][0].token).not.toBe('access-token');
    expect(tokenModel.create.mock.calls[1][0].token).not.toBe('refresh-token');
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

  it('saves access and refresh tokens with caller-provided familyId', async () => {
    tokenModel.create.mockResolvedValue({});

    await service.saveAccessToken({
      userId: 'account-a',
      email: 'a@example.com',
      role: 'user',
      accessToken: 'access-token',
      expiresAt: new Date('2026-07-09T10:15:00.000Z'),
    });
    await service.saveRefreshToken({
      userId: 'account-a',
      email: 'a@example.com',
      refreshToken: 'refresh-token',
      familyId: 'family-1',
      expiresAt: new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(tokenModel.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        token: hashToken('access-token'),
        type: TOKEN_TYPES.ACCESS,
        deviceInfo: 'Web',
      }),
    );
    expect(tokenModel.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        token: hashToken('refresh-token'),
        type: TOKEN_TYPES.REFRESH,
        familyId: 'family-1',
        deviceInfo: 'Web',
      }),
    );
  });
});
