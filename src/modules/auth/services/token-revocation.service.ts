import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isMongoUnavailable } from '../../../common/utils/mongo-error.util';
import { Token, TokenDocument } from '../schemas/token.schema';
import { hashToken } from '../utils/token-hash.util';

@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
  ) {}

  async revokeSessionTokens(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<{ message: string }> {
    if (!accessToken && !refreshToken) {
      throw new UnauthorizedException('Token is invalid or missing');
    }

    try {
      const hashedTokens = (
        [accessToken, refreshToken].filter(Boolean) as string[]
      ).map(token => hashToken(token));

      await this.tokenModel.updateMany(
        { token: { $in: hashedTokens } },
        { status: false },
      );
      return { message: 'Signed out successfully' };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        'Session token revocation failed: ' + err.message,
        err.stack,
      );
      if (isMongoUnavailable(error)) {
        throw new ServiceUnavailableException(
          'Database temporarily unavailable',
        );
      }
      throw new InternalServerErrorException('Failed to sign out user.');
    }
  }

  async invalidateToken(token: string): Promise<void> {
    this.logger.log('Invalidating token');
    try {
      await this.tokenModel.updateOne(
        { token: hashToken(token) },
        { status: false },
      );
      this.logger.log('Token invalidated');
    } catch (error) {
      const err = error as Error;
      this.logger.error('Token invalidation failed: ' + err.message, err.stack);
      throw new InternalServerErrorException('Cannot invalidate token.');
    }
  }

  async invalidateAllTokensForUser(userId: string): Promise<void> {
    this.logger.log('Invalidating all tokens for userId: ' + userId);
    try {
      await this.tokenModel.updateMany({ userId }, { status: false });
      this.logger.log('All tokens invalidated for userId: ' + userId);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        'Invalidate all tokens failed for userId ' +
          userId +
          ': ' +
          err.message,
        err.stack,
      );
      throw new InternalServerErrorException(
        'Cannot invalidate all user tokens.',
      );
    }
  }
}
