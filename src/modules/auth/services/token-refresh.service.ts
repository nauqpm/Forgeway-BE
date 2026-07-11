import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { isMongoUnavailable } from '../../../common/utils/mongo-error.util';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { UsersService } from '../../users/services/users.service';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { Token, TokenDocument } from '../schemas/token.schema';
import { RefreshJwtPayload } from '../types/jwt-payload.type';
import { hashToken } from '../utils/token-hash.util';
import { TokenIssuerService } from './token-issuer.service';

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
    private readonly jwtService: JwtService,
    private readonly authTokenConfig: AuthTokenConfigService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly tokenIssuerService: TokenIssuerService,
  ) {}

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ success: boolean; accessToken: string; refreshToken: string }> {
    try {
      const decoded = this.jwtService.verify<RefreshJwtPayload>(refreshToken, {
        secret: this.authTokenConfig.refreshTokenSecret,
      });

      if (decoded.type !== TOKEN_TYPES.REFRESH) {
        throw new UnauthorizedException('Token is not a refresh token');
      }

      const consumed = await this.tokenModel.findOneAndUpdate(
        {
          token: hashToken(refreshToken),
          status: true,
          type: TOKEN_TYPES.REFRESH,
        },
        { $set: { status: false } },
        { new: false },
      );

      if (!consumed) {
        const revokedToken = await this.tokenModel.findOne({
          token: hashToken(refreshToken),
          status: false,
          type: TOKEN_TYPES.REFRESH,
        });

        if (revokedToken?.familyId) {
          const revokedAgeMs = Date.now() - revokedToken.updatedAt.getTime();
          const concurrentGraceMs = 15_000;

          if (revokedAgeMs > concurrentGraceMs) {
            await this.tokenModel.updateMany(
              { familyId: revokedToken.familyId, status: true },
              { $set: { status: false } },
            );
            this.logger.error(
              'Refresh token reuse detected outside grace window; familyId: ' +
                String(revokedToken.familyId) +
                ', userId: ' +
                String(revokedToken.userId),
            );
            this.auditLogService.log({
              type: SECURITY_EVENT_TYPES.TOKEN_FAMILY_REVOKED,
              severity: 'CRITICAL',
              userId: revokedToken.userId?.toString(),
              metadata: { familyId: revokedToken.familyId, revokedAgeMs },
            });
            throw new UnauthorizedException({
              statusCode: 401,
              error: SECURITY_EVENT_TYPES.TOKEN_FAMILY_REVOKED,
              message:
                'Session was revoked due to suspicious activity. Please sign in again.',
            });
          }

          this.auditLogService.log({
            type: SECURITY_EVENT_TYPES.REFRESH_REUSED,
            severity: 'WARN',
            userId: revokedToken.userId?.toString(),
            metadata: {
              familyId: revokedToken.familyId,
              revokedAgeMs,
              withinGrace: true,
            },
          });
        }

        throw new UnauthorizedException('Refresh token is invalid or expired');
      }

      const user = await this.usersService.getUserById(decoded.userId);
      if (!user) {
        throw new UnauthorizedException('User does not exist');
      }

      await this.tokenModel.updateMany(
        { userId: decoded.userId, type: TOKEN_TYPES.ACCESS, status: true },
        { $set: { status: false } },
      );

      const newAccessToken = this.tokenIssuerService.createAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        avatar: user.avatar,
        rootUserId: decoded.rootUserId,
      });
      const newRefreshToken = this.tokenIssuerService.createRefreshToken({
        userId: user._id.toString(),
        rootUserId: decoded.rootUserId,
      });

      const familyId =
        consumed.familyId ?? this.generateFallbackFamilyId(decoded.userId);

      await this.tokenIssuerService.saveAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        accessToken: newAccessToken,
        expiresAt: this.authTokenConfig.getAccessTokenExpiresAt(),
      });
      await this.tokenIssuerService.saveRefreshToken({
        userId: user._id.toString(),
        email: user.email,
        refreshToken: newRefreshToken,
        familyId,
        expiresAt: this.authTokenConfig.getRefreshTokenExpiresAt(),
      });

      this.logger.debug(
        'Token rotated for userId: ' + decoded.userId + ', family: ' + familyId,
      );

      return {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const err = error as Error;
      if (err.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Refresh token is invalid');
      }
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'Refresh token has expired. Please sign in again',
        );
      }
      if (isMongoUnavailable(error)) {
        throw new ServiceUnavailableException(
          'Database temporarily unavailable',
        );
      }
      this.logger.error(
        'Refresh token rotation failed: ' + err.message,
        err.stack,
      );
      throw error;
    }
  }

  private generateFallbackFamilyId(userId: string): string {
    const generated = randomBytes(16).toString('hex');
    this.logger.warn(
      'Consumed refresh token has no familyId; userId: ' +
        userId +
        '. Theft detection unavailable for this token. Generated fallback: ' +
        generated,
    );
    return generated;
  }
}
