// src/modules/auth/services/token.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TOKEN_TYPES } from '../constants/token.constants';
import { TokenDocument } from '../schemas/token.schema';
import { hashToken } from '../utils/token-hash.util';
import { PasswordResetGrantService } from './password-reset-grant.service';
import { TokenIssuerService } from './token-issuer.service';
import { TokenRefreshService } from './token-refresh.service';
import { TokenRevocationService } from './token-revocation.service';
import { TokenLookupService } from './token-lookup.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly passwordResetGrantService: PasswordResetGrantService,
    private readonly tokenIssuerService: TokenIssuerService,
    private readonly tokenRefreshService: TokenRefreshService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly tokenLookupService: TokenLookupService,
  ) {}

  // Public: compatibility wrapper - used by other auth-domain services (password reset, logout, refresh)
  hashToken(token: string): string {
    return hashToken(token);
  }

  /**
   * Best-effort: extract the effective owner id from a JWT access token without enforcing expiry.
   * Used only to discover the current owner for account switcher population.
   */
  peekUserIdFromAccessToken(token: string | undefined): string | null {
    if (!token) return null;
    try {
      const payload = this.jwtService.verify<{
        userId?: string;
        rootUserId?: string;
        type?: string;
      }>(token, { ignoreExpiration: true });
      if (
        payload &&
        typeof payload === 'object' &&
        payload.type === TOKEN_TYPES.ACCESS &&
        payload.userId
      ) {
        return payload.rootUserId ?? payload.userId;
      }
    } catch {
      // Invalid signature, malformed, etc. - treat as no owner.
    }
    return null;
  }

  async createAndSaveTokens(
    userId: string,
    email: string,
    role: string,
    fullName?: string,
    avatar?: string,
    rootUserId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.tokenIssuerService.createAndSaveTokens(
      userId,
      email,
      role,
      fullName,
      avatar,
      rootUserId,
    );
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ success: boolean; accessToken: string; refreshToken: string }> {
    return this.tokenRefreshService.refreshAccessToken(refreshToken);
  }

  revokeSessionTokens(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<{ message: string }> {
    return this.tokenRevocationService.revokeSessionTokens(
      accessToken,
      refreshToken,
    );
  }

  createResetGrant(
    userId: string,
    email: string,
  ): Promise<{ resetGrant: string; expiresInMs: number }> {
    return this.passwordResetGrantService.createResetGrant(userId, email);
  }

  consumeResetGrant(resetGrant: string): Promise<{ email: string }> {
    return this.passwordResetGrantService.consumeResetGrant(resetGrant);
  }

  validateResetGrant(resetGrant: string): Promise<{ email: string }> {
    return this.passwordResetGrantService.validateResetGrant(resetGrant);
  }

  invalidateToken(token: string): Promise<void> {
    return this.tokenRevocationService.invalidateToken(token);
  }

  async findActiveAccessToken(token: string): Promise<TokenDocument | null> {
    return this.tokenLookupService.findActiveAccessToken(token);
  }

  async findActiveRefreshToken(token: string): Promise<TokenDocument | null> {
    return this.tokenLookupService.findActiveRefreshToken(token);
  }

  async findToken(token: string): Promise<TokenDocument | null> {
    return this.tokenLookupService.findToken(token);
  }

  invalidateAllTokensForUser(userId: string): Promise<void> {
    return this.tokenRevocationService.invalidateAllTokensForUser(userId);
  }
}
