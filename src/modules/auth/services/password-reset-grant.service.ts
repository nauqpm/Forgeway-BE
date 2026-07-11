import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { TOKEN_TYPES } from '../constants/token.constants';
import { Token, TokenDocument } from '../schemas/token.schema';
import { hashToken } from '../utils/token-hash.util';

@Injectable()
export class PasswordResetGrantService {
  private readonly logger = new Logger(PasswordResetGrantService.name);

  constructor(
    @InjectModel(Token.name) private readonly tokenModel: Model<TokenDocument>,
  ) {}

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
      token: hashToken(resetGrant),
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
      throw new BadRequestException('Reset grant is invalid');
    }

    const consumed = await this.tokenModel.findOneAndUpdate(
      {
        token: hashToken(resetGrant),
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
        'Reset grant is invalid, expired, or already used',
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
      throw new BadRequestException('Reset grant is invalid');
    }

    const activeGrant = await this.tokenModel
      .findOne({
        token: hashToken(resetGrant),
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
        'Reset grant is invalid, expired, or already used',
      );
    }

    return { email: activeGrant.email };
  }
}
