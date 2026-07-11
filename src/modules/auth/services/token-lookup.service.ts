// src/modules/auth/services/token-lookup.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TOKEN_TYPES } from '../constants/token.constants';
import { Token, TokenDocument } from '../schemas/token.schema';
import { hashToken } from '../utils/token-hash.util';

@Injectable()
export class TokenLookupService {
  private readonly logger = new Logger(TokenLookupService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
  ) {}

  async findActiveAccessToken(token: string): Promise<TokenDocument | null> {
    this.logger.log('Finding active access token');
    try {
      return await this.tokenModel
        .findOne({
          token: hashToken(token),
          status: true,
          type: TOKEN_TYPES.ACCESS,
        })
        .exec();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Find active access token failed: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        'Kh\u00f4ng th\u1ec3 t\u00ecm th\u1ea5y token.',
      );
    }
  }

  async findActiveRefreshToken(token: string): Promise<TokenDocument | null> {
    this.logger.log('Finding active refresh token');
    try {
      return await this.tokenModel
        .findOne({
          token: hashToken(token),
          status: true,
          type: TOKEN_TYPES.REFRESH,
        })
        .exec();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Find active refresh token failed: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        'Kh\u00f4ng th\u1ec3 t\u00ecm th\u1ea5y token.',
      );
    }
  }

  async findToken(token: string): Promise<TokenDocument | null> {
    this.logger.log('Finding token');
    try {
      return await this.tokenModel
        .findOne({
          token: hashToken(token),
          status: true,
        })
        .exec();
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Find token failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException(
        'Kh\u00f4ng th\u1ec3 t\u00ecm th\u1ea5y token.',
      );
    }
  }
}
