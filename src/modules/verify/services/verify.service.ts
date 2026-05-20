import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';

import { VerifyType } from '../dtos/verify.dto';
import { Verify, VerifyDocument } from '../schemas/verify.schema';

@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  constructor(
    @InjectModel(Verify.name) private verifyModel: Model<VerifyDocument>,
    private readonly mailerService: MailerService,
  ) {}

  private generateCode(): string {
    return randomInt(100000, 1_000_000).toString();
  }

  async generateVerificationCode(email: string): Promise<string> {
    const code = this.generateCode();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.verifyModel.updateMany(
      { email, type: VerifyType.VERIFICATION, isUsed: false },
      { isUsed: true },
    );

    await this.verifyModel.create({
      email,
      code,
      type: VerifyType.VERIFICATION,
      isUsed: false,
      expiresAt,
    });

    return code;
  }

  async verifyCode(
    email: string,
    code: string,
    type: VerifyType,
  ): Promise<{ valid: boolean; message: string }> {
    const verification = await this.verifyModel.findOne({
      email,
      code,
      type,
      isUsed: false,
    });

    if (!verification) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const now = new Date();
    if (verification.expiresAt < now) {
      throw new BadRequestException('Verification code has expired');
    }

    verification.isUsed = true;
    await verification.save();

    return {
      valid: true,
      message: 'Verification successful',
    };
  }

  async sendVerificationEmail(email: string): Promise<void> {
    const code = await this.generateVerificationCode(email);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Xac thuc email - Ma xac minh',
      template: './verification',
      context: { code },
    });
  }

  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    this.logger.debug(`Preparing password reset OTP email for: ${email}`);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.verifyModel.create({
      email,
      code: otp,
      type: VerifyType.PASSWORD_RESET,
      isUsed: false,
      expiresAt,
    });

    await this.mailerService.sendMail({
      to: email,
      subject: 'Reset Password',
      template: './password-reset',
      context: { otp },
    });

    this.logger.log(`Password reset OTP email sent to: ${email}`);
  }

  async verifyPasswordResetCode(
    email: string,
    otp: string,
  ): Promise<{ valid: boolean; message: string }> {
    return this.verifyCode(email, otp, VerifyType.PASSWORD_RESET);
  }

  async findByEmail(email: string): Promise<VerifyDocument[]> {
    return this.verifyModel.find({ email }).exec();
  }

  async markAsUsed(email: string, code: string): Promise<void> {
    await this.verifyModel.updateOne(
      { email, code },
      { isUsed: true },
    );
  }

  async cleanupExpiredCodes(): Promise<number> {
    const result = await this.verifyModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount;
  }
}
