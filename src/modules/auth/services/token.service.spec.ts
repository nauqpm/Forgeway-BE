import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { PasswordResetGrantService } from './password-reset-grant.service';
import { TokenIssuerService } from './token-issuer.service';
import { TokenRefreshService } from './token-refresh.service';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const tokenModel = {
    create: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
    findOne: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const tokenIssuerService = {
    createAndSaveTokens: jest.fn(),
  };

  const tokenRefreshService = {
    refreshAccessToken: jest.fn(),
  };

  const passwordResetGrantService = {
    createResetGrant: jest.fn(),
    consumeResetGrant: jest.fn(),
    validateResetGrant: jest.fn(),
  };

  const authTokenConfig = {
    getAccessTokenExpiresAt: jest.fn(
      () => new Date('2026-07-09T10:15:00.000Z'),
    ),
  };

  let service: TokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenService(
      tokenModel as never,
      jwtService as unknown as JwtService,
      authTokenConfig as unknown as AuthTokenConfigService,
      passwordResetGrantService as unknown as PasswordResetGrantService,
      tokenIssuerService as unknown as TokenIssuerService,
      tokenRefreshService as unknown as TokenRefreshService,
    );
  });

  describe('token pair issuance facade', () => {
    it('delegates createAndSaveTokens to TokenIssuerService', async () => {
      tokenIssuerService.createAndSaveTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await expect(
        service.createAndSaveTokens(
          'account-b',
          'b@example.com',
          'user',
          'Account B',
          'avatar.png',
          'account-a',
        ),
      ).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(tokenIssuerService.createAndSaveTokens).toHaveBeenCalledWith(
        'account-b',
        'b@example.com',
        'user',
        'Account B',
        'avatar.png',
        'account-a',
      );
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

  describe('refresh token facade', () => {
    it('delegates refreshAccessToken to TokenRefreshService', async () => {
      tokenRefreshService.refreshAccessToken.mockResolvedValue({
        success: true,
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
      });

      await expect(
        service.refreshAccessToken('refresh-token'),
      ).resolves.toEqual({
        success: true,
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
      });
      expect(tokenRefreshService.refreshAccessToken).toHaveBeenCalledWith(
        'refresh-token',
      );
    });
  });

  describe('token revocation', () => {
    it('revokes access and refresh session tokens by hash', async () => {
      tokenModel.updateMany.mockResolvedValue({});

      const result = await service.revokeSessionTokens(
        'access-token',
        'refresh-token',
      );

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

  describe('password reset grant facade', () => {
    it('delegates createResetGrant to PasswordResetGrantService', async () => {
      passwordResetGrantService.createResetGrant.mockResolvedValue({
        resetGrant: 'grant',
        expiresInMs: 600000,
      });

      await expect(
        service.createResetGrant('account-a', 'a@test.com'),
      ).resolves.toEqual({ resetGrant: 'grant', expiresInMs: 600000 });
      expect(passwordResetGrantService.createResetGrant).toHaveBeenCalledWith(
        'account-a',
        'a@test.com',
      );
    });

    it('delegates consumeResetGrant to PasswordResetGrantService', async () => {
      passwordResetGrantService.consumeResetGrant.mockResolvedValue({
        email: 'a@test.com',
      });

      await expect(service.consumeResetGrant('grant')).resolves.toEqual({
        email: 'a@test.com',
      });
      expect(passwordResetGrantService.consumeResetGrant).toHaveBeenCalledWith(
        'grant',
      );
    });

    it('delegates validateResetGrant to PasswordResetGrantService', async () => {
      passwordResetGrantService.validateResetGrant.mockResolvedValue({
        email: 'a@test.com',
      });

      await expect(service.validateResetGrant('grant')).resolves.toEqual({
        email: 'a@test.com',
      });
      expect(passwordResetGrantService.validateResetGrant).toHaveBeenCalledWith(
        'grant',
      );
    });
  });

  describe('token lookup', () => {
    it('finds active access token by hash', async () => {
      const tokenDoc = { token: 'hashed' };
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tokenDoc),
      });

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
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tokenDoc),
      });

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
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tokenDoc),
      });

      await expect(service.findToken('token')).resolves.toBe(tokenDoc);
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: service.hashToken('token'),
        status: true,
      });
    });
  });
});
