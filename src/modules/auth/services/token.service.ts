// src/modules/auth/services/token.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { Token, TokenDocument } from '../schemas/token.schema';
import { hashToken } from '../utils/token-hash.util';
import { PasswordResetGrantService } from './password-reset-grant.service';
import { TokenIssuerService } from './token-issuer.service';
import { TokenRefreshService } from './token-refresh.service';
import { TokenRevocationService } from './token-revocation.service';
import { TokenLookupService } from './token-lookup.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
    private readonly jwtService: JwtService,
    private readonly authTokenConfig: AuthTokenConfigService,
    private readonly passwordResetGrantService: PasswordResetGrantService,
    private readonly tokenIssuerService: TokenIssuerService,
    private readonly tokenRefreshService: TokenRefreshService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly tokenLookupService: TokenLookupService,
  ) {}

  // Public: used by other auth-domain services (password reset, logout, refresh)
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

  // Legacy single-token creator (kept for backward compatibility if used elsewhere).
  async createAndSaveToken(
    userId: string,
    email: string,
    role: string,
    fullName?: string,
    avatar?: string,
    deviceInfo: string = 'Web',
  ): Promise<string> {
    this.logger.log(`Creating token for userId: ${userId}, email: ${email}`);

    try {
      const payload = { userId, email, role, fullName, avatar };
      const token = this.jwtService.sign(payload);

      const expiresAt = this.authTokenConfig.getAccessTokenExpiresAt();

      const newToken = new this.tokenModel({
        userId,
        email,
        token: this.hashToken(token),
        deviceInfo,
        status: true,
        expiresAt,
      });

      await newToken.save();
      this.logger.log(`Token stored for user: ${email}`);
      return token;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Token creation failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException(
        'Kh\u00f4ng th\u1ec3 t\u1ea1o token.',
      );
    }
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
