import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { isMongoUnavailable } from '../../../common/utils/mongo-error.util';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { Token, TokenDocument } from '../schemas/token.schema';
import { hashToken } from '../utils/token-hash.util';

export interface CreateAccessTokenParams {
  userId: string;
  email: string;
  role: string;
  fullName?: string;
  avatar?: string;
  rootUserId?: string;
}

export interface CreateRefreshTokenParams {
  userId: string;
  rootUserId?: string;
}

export interface SaveAccessTokenParams {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  expiresAt: Date;
  deviceInfo?: string;
}

export interface SaveRefreshTokenParams {
  userId: string;
  email: string;
  refreshToken: string;
  familyId: string;
  expiresAt: Date;
  deviceInfo?: string;
}

@Injectable()
export class TokenIssuerService {
  private readonly logger = new Logger(TokenIssuerService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
    private readonly jwtService: JwtService,
    private readonly authTokenConfig: AuthTokenConfigService,
  ) {}

  async createAndSaveTokens(
    userId: string,
    email: string,
    role: string,
    fullName?: string,
    avatar?: string,
    rootUserId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const accessToken = this.createAccessToken({
        userId,
        email,
        role,
        fullName,
        avatar,
        rootUserId,
      });
      const refreshToken = this.createRefreshToken({ userId, rootUserId });

      const familyId = randomBytes(16).toString('hex');
      const accessExpiry = this.authTokenConfig.getAccessTokenExpiresAt();
      const refreshExpiry = this.authTokenConfig.getRefreshTokenExpiresAt();

      await this.saveAccessToken({
        userId,
        email,
        role,
        accessToken,
        expiresAt: accessExpiry,
      });
      await this.saveRefreshToken({
        userId,
        email,
        refreshToken,
        familyId,
        expiresAt: refreshExpiry,
      });

      this.logger.debug(
        `Token pair stored for userId: ${userId}, family: ${familyId}`,
      );
      return { accessToken, refreshToken };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Token pair creation failed: ${err.message}`,
        err.stack,
      );
      if (isMongoUnavailable(error)) {
        throw new ServiceUnavailableException(
          'Database temporarily unavailable',
        );
      }
      throw new InternalServerErrorException(
        'Cannot create authentication tokens',
      );
    }
  }

  createAccessToken(params: CreateAccessTokenParams): string {
    const payload = {
      userId: params.userId,
      email: params.email,
      role: params.role,
      fullName: params.fullName,
      avatar: params.avatar,
      type: TOKEN_TYPES.ACCESS,
      jti: randomBytes(8).toString('hex'),
      ...(params.rootUserId ? { rootUserId: params.rootUserId } : {}),
    };
    return this.jwtService.sign(payload);
  }

  createRefreshToken(params: CreateRefreshTokenParams): string {
    const payload = {
      userId: params.userId,
      ...(params.rootUserId ? { rootUserId: params.rootUserId } : {}),
      type: TOKEN_TYPES.REFRESH,
      jti: randomBytes(8).toString('hex'),
    };
    return this.jwtService.sign(payload, {
      secret: this.authTokenConfig.refreshTokenSecret,
      expiresIn: this.authTokenConfig.refreshTokenTtlSeconds,
    });
  }

  async saveAccessToken(params: SaveAccessTokenParams): Promise<void> {
    await this.tokenModel.create({
      userId: params.userId,
      email: params.email,
      role: params.role,
      token: hashToken(params.accessToken),
      deviceInfo: params.deviceInfo ?? 'Web',
      status: true,
      type: TOKEN_TYPES.ACCESS,
      expiresAt: params.expiresAt,
    });
  }

  async saveRefreshToken(params: SaveRefreshTokenParams): Promise<void> {
    await this.tokenModel.create({
      userId: params.userId,
      email: params.email,
      token: hashToken(params.refreshToken),
      deviceInfo: params.deviceInfo ?? 'Web',
      status: true,
      type: TOKEN_TYPES.REFRESH,
      familyId: params.familyId,
      expiresAt: params.expiresAt,
    });
  }
}
