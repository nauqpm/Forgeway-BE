// src/modules/auth/services/token.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Token, TokenDocument } from '../schemas/token.schema';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../../users/services/users.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { RefreshJwtPayload } from '../types/jwt-payload.type';
import { AuthTokenConfigService } from '../config/auth-token-config.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
    private readonly jwtService: JwtService,
    private readonly authTokenConfig: AuthTokenConfigService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private isMongoUnavailable(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const mongoNetworkErrors = [
      'MongoServerSelectionError',
      'MongoNetworkTimeoutError',
      'MongoNetworkError',
    ];
    return mongoNetworkErrors.includes(error.name);
  }

  // Public: used by other auth-domain services (password reset, logout, refresh)
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Best-effort: extract userId from a JWT access token without enforcing expiry.
   * Used only to discover the "current owner" so we can populate the account switcher
   * when a second account logs in on the same browser. Returns null on any error.
   */
  peekUserIdFromAccessToken(token: string | undefined): string | null {
    if (!token) return null;
    try {
      const payload = this.jwtService.verify<{
        userId?: string;
        type?: string;
      }>(token, { ignoreExpiration: true });
      if (
        payload &&
        typeof payload === 'object' &&
        payload.type === TOKEN_TYPES.ACCESS &&
        payload.userId
      ) {
        return payload.userId;
      }
    } catch {
      // Invalid signature, malformed, etc. — treat as no owner.
    }
    return null;
  }

  // Legacy single-token creator (kept for backward compat if used elsewhere)
  async createAndSaveToken(
    userId: string,
    email: string,
    role: string,
    fullName?: string,
    avatar?: string,
    deviceInfo: string = 'Web',
  ): Promise<string> {
    this.logger.log(`🔑 Tạo token mới cho userId: ${userId}, email: ${email}`);

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
      this.logger.log(
        `✅ Token được lưu thành công vào database cho user: ${email}`,
      );
      return token;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Lỗi khi tạo token: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Không thể tạo token.');
    }
  }

  /**
   * Access(15m) + Refresh(7d) token pair issuance (behavior preserved)
   */
  async createAndSaveTokens(
    userId: string,
    email: string,
    role: string,
    fullName?: string,
    avatar?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const accessToken = this.createAccessToken(
        userId,
        email,
        role,
        fullName,
        avatar,
      );
      const refreshToken = this.createRefreshToken(userId);

      const familyId = randomBytes(16).toString('hex');
      const accessExpiry = this.authTokenConfig.getAccessTokenExpiresAt();
      const refreshExpiry = this.authTokenConfig.getRefreshTokenExpiresAt();

      await this.tokenModel.create({
        userId,
        email,
        role,
        token: this.hashToken(accessToken),
        deviceInfo: 'Web',
        status: true,
        type: TOKEN_TYPES.ACCESS,
        expiresAt: accessExpiry,
      });

      await this.tokenModel.create({
        userId,
        email,
        token: this.hashToken(refreshToken),
        deviceInfo: 'Web',
        status: true,
        type: TOKEN_TYPES.REFRESH,
        familyId,
        expiresAt: refreshExpiry,
      });

      this.logger.debug(
        `🔑 Tokens đã được tạo và lưu cho userId: ${userId}, family: ${familyId}`,
      );
      return { accessToken, refreshToken };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Error creating tokens: ${err.message}`, err.stack);
      if (this.isMongoUnavailable(error)) {
        throw new ServiceUnavailableException(
          'Database temporarily unavailable',
        );
      }
      throw new InternalServerErrorException(
        'Cannot create authentication tokens',
      );
    }
  }

  private createAccessToken(
    userId: string,
    email: string,
    role: string,
    fullName?: string,
    avatar?: string,
  ): string {
    const payload = {
      userId,
      email,
      role,
      fullName,
      avatar,
      type: TOKEN_TYPES.ACCESS,
    };
    return this.jwtService.sign(payload);
  }

  private createRefreshToken(userId: string): string {
    // Add jti to avoid identical JWT when issued within same second (token field has unique index)
    const payload = {
      userId,
      type: TOKEN_TYPES.REFRESH,
      jti: randomBytes(8).toString('hex'),
    };
    return this.jwtService.sign(payload, {
      secret: this.authTokenConfig.refreshTokenSecret,
      expiresIn: this.authTokenConfig.refreshTokenTtlSeconds,
    });
  }

  /**
   * Revoke current session tokens (access + refresh) by raw token(s)
   */
  async revokeSessionTokens(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<{ message: string }> {
    if (!accessToken && !refreshToken) {
      throw new UnauthorizedException('Token không hợp lệ hoặc thiếu');
    }

    try {
      const hashedTokens = (
        [accessToken, refreshToken].filter(Boolean) as string[]
      ).map(t => this.hashToken(t));

      await this.tokenModel.updateMany(
        { token: { $in: hashedTokens } },
        { status: false },
      );
      return { message: 'Đăng xuất thành công' };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`❌ Lỗi khi đăng xuất: ${err.message}`, err.stack);
      if (this.isMongoUnavailable(error)) {
        throw new ServiceUnavailableException(
          'Database temporarily unavailable',
        );
      }
      throw new InternalServerErrorException('Lỗi khi đăng xuất người dùng.');
    }
  }

  async createResetGrant(
    userId: string,
    email: string,
  ): Promise<{ resetGrant: string; expiresInMs: number }> {
    this.logger.debug(`Creating password reset grant for userId: ${userId}`);

    const expiresInMs = 10 * 60 * 1000;
    const resetGrant = randomBytes(32).toString('base64url');

    await this.tokenModel.create({
      userId,
      email,
      token: this.hashToken(resetGrant),
      deviceInfo: 'Password Reset Grant',
      status: true,
      type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
      expiresAt: new Date(Date.now() + expiresInMs),
    });

    this.logger.debug(
      `Password reset grant stored for userId: ${userId}; expiresInMs: ${expiresInMs}`,
    );
    return { resetGrant, expiresInMs };
  }

  async consumeResetGrant(resetGrant: string): Promise<{ email: string }> {
    this.logger.debug('Consuming password reset grant');

    if (!resetGrant?.trim()) {
      this.logger.warn('Password reset grant consume rejected: empty grant');
      throw new BadRequestException('Reset grant khong hop le');
    }

    const consumed = await this.tokenModel.findOneAndUpdate(
      {
        token: this.hashToken(resetGrant),
        status: true,
        type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
        expiresAt: { $gt: new Date() },
      },
      { $set: { status: false } },
      { new: false },
    );

    if (!consumed) {
      this.logger.warn(
        'Password reset grant consume rejected: invalid, expired, or reused grant',
      );
      throw new UnauthorizedException(
        'Reset grant khong hop le, da het han hoac da duoc su dung',
      );
    }

    this.logger.debug(
      `Password reset grant consumed for userId: ${String(consumed.userId)}`,
    );
    return { email: consumed.email };
  }

  async validateResetGrant(resetGrant: string): Promise<{ email: string }> {
    this.logger.debug('Validating password reset grant');

    if (!resetGrant?.trim()) {
      this.logger.warn('Password reset grant validation rejected: empty grant');
      throw new BadRequestException('Reset grant khong hop le');
    }

    const activeGrant = await this.tokenModel
      .findOne({
        token: this.hashToken(resetGrant),
        status: true,
        type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (!activeGrant) {
      this.logger.warn(
        'Password reset grant validation rejected: invalid, expired, or reused grant',
      );
      throw new UnauthorizedException(
        'Reset grant khong hop le, da het han hoac da duoc su dung',
      );
    }

    return { email: activeGrant.email };
  }
  /**
   * 🔄 Refresh Access Token
   * SEC-8: Atomic consume + token family theft detection
   * Refresh token rotation with family reuse detection (behavior preserved)
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ success: boolean; accessToken: string; refreshToken: string }> {
    try {
      const decoded = this.jwtService.verify<RefreshJwtPayload>(refreshToken, {
        secret: this.authTokenConfig.refreshTokenSecret,
      });

      if (decoded.type !== TOKEN_TYPES.REFRESH) {
        throw new UnauthorizedException('Token không phải là refresh token');
      }

      const consumed = await this.tokenModel.findOneAndUpdate(
        {
          token: this.hashToken(refreshToken),
          status: true,
          type: TOKEN_TYPES.REFRESH,
        },
        { $set: { status: false } },
        { new: false },
      );

      if (!consumed) {
        const revokedToken = await this.tokenModel.findOne({
          token: this.hashToken(refreshToken),
          status: false,
          type: TOKEN_TYPES.REFRESH,
        });

        if (revokedToken?.familyId) {
          const revokedAgeMs = Date.now() - revokedToken.updatedAt.getTime();
          const CONCURRENT_GRACE_MS = 15_000;

          if (revokedAgeMs > CONCURRENT_GRACE_MS) {
            await this.tokenModel.updateMany(
              { familyId: revokedToken.familyId, status: true },
              { $set: { status: false } },
            );
            this.logger.error(
              `🚨 REFRESH TOKEN THEFT DETECTED — familyId: ${String(revokedToken.familyId)}, userId: ${String(revokedToken.userId)}`,
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
                'Phiên đăng nhập bị thu hồi do phát hiện dấu hiệu bất thường. Vui lòng đăng nhập lại.',
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

        throw new UnauthorizedException(
          'Refresh token không hợp lệ hoặc đã hết hạn',
        );
      }

      const user = await this.usersService.getUserById(decoded.userId);
      if (!user) {
        throw new UnauthorizedException('User không tồn tại');
      }

      await this.tokenModel.updateMany(
        { userId: decoded.userId, type: TOKEN_TYPES.ACCESS, status: true },
        { $set: { status: false } },
      );

      const newAccessToken = this.createAccessToken(
        user._id.toString(),
        user.email,
        user.role,
        user.fullName,
        user.avatar,
      );
      const newRefreshToken = this.createRefreshToken(user._id.toString());

      const familyId = consumed.familyId ?? randomBytes(16).toString('hex');

      const accessExpiry = this.authTokenConfig.getAccessTokenExpiresAt();
      const refreshExpiry = this.authTokenConfig.getRefreshTokenExpiresAt();

      await this.tokenModel.create({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        token: this.hashToken(newAccessToken),
        deviceInfo: 'Web',
        status: true,
        type: TOKEN_TYPES.ACCESS,
        expiresAt: accessExpiry,
      });

      await this.tokenModel.create({
        userId: user._id.toString(),
        email: user.email,
        token: this.hashToken(newRefreshToken),
        deviceInfo: 'Web',
        status: true,
        type: TOKEN_TYPES.REFRESH,
        familyId,
        expiresAt: refreshExpiry,
      });

      this.logger.debug(
        `🔄 Token rotated — userId: ${decoded.userId}, family: ${familyId}`,
      );

      return {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'Refresh token đã hết hạn, vui lòng đăng nhập lại',
        );
      }
      this.logger.error(`❌ Lỗi khi refresh token: ${err.message}`, err.stack);
      if (this.isMongoUnavailable(error)) {
        throw new ServiceUnavailableException(
          'Database temporarily unavailable',
        );
      }
      throw error;
    }
  }

  // 🚪 Đăng xuất và hủy token
  async invalidateToken(token: string): Promise<void> {
    this.logger.log(`🚪 Hủy token`);
    try {
      await this.tokenModel.updateOne(
        { token: this.hashToken(token) },
        { status: false },
      );
      this.logger.log(`✅ Token đã được hủy`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Lỗi khi hủy token: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Không thể hủy token.');
    }
  }

  // 🔍 Tìm access token (không check expiresAt — JWT expiry tự xử lý)
  async findActiveAccessToken(token: string): Promise<TokenDocument | null> {
    this.logger.log(`🔍 Tìm access token trong database`);
    try {
      return await this.tokenModel
        .findOne({
          token: this.hashToken(token),
          status: true,
          type: TOKEN_TYPES.ACCESS,
        })
        .exec();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Lỗi khi tìm access token: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException('Không thể tìm thấy token.');
    }
  }

  // 🔍 Tìm refresh token (check expiresAt nếu có)
  async findActiveRefreshToken(token: string): Promise<TokenDocument | null> {
    this.logger.log(`🔍 Tìm refresh token trong database`);
    try {
      return await this.tokenModel
        .findOne({
          token: this.hashToken(token),
          status: true,
          type: TOKEN_TYPES.REFRESH,
        })
        .exec();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Lỗi khi tìm refresh token: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException('Không thể tìm thấy token.');
    }
  }

  // 🔍 Legacy: tìm token theo hash (giữ backward compat nội bộ)
  async findToken(token: string): Promise<TokenDocument | null> {
    this.logger.log(`🔍 Tìm token trong database`);
    try {
      return await this.tokenModel
        .findOne({
          token: this.hashToken(token),
          status: true,
        })
        .exec();
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Lỗi khi tìm token: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Không thể tìm thấy token.');
    }
  }

  // 📤 Xóa tất cả token của người dùng (Ví dụ khi đăng xuất tất cả thiết bị)
  async invalidateAllTokensForUser(userId: string): Promise<void> {
    this.logger.log(`📤 Hủy tất cả token của userId: ${userId}`);
    try {
      await this.tokenModel.updateMany({ userId }, { status: false });
      this.logger.log(`✅ Tất cả token của userId ${userId} đã bị hủy`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Lỗi khi hủy tất cả token của userId ${userId}: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        'Không thể hủy tất cả token của người dùng.',
      );
    }
  }
}
