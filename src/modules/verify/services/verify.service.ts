import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { Verify, VerifyDocument } from '../schemas/verify.schema';
import { VerifyType } from '../dtos/verify.dto';
import { randomInt } from 'crypto';
import {
  hashOtpCode,
  verifyOtpCode,
} from '../../../common/utils/otp-hash.util';

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
      code: hashOtpCode(code),
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
    this.logger.log(`Attempting to verify code for ${email} (Type: ${type})`);
    const verification = await this.verifyModel
      .findOne({
        email,
        type,
        isUsed: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });

    const storedCodeHash = verification?.code ?? hashOtpCode('000000');
    const isValid =
      Boolean(verification) && verifyOtpCode(code, storedCodeHash);

    if (!isValid) {
      this.logger.warn(
        `Verification failed for ${email}: Invalid or expired code`,
      );
      throw new BadRequestException('Invalid or expired verification code');
    }

    verification!.isUsed = true;
    await verification!.save();

    this.logger.log(`Successfully verified code for ${email}`);
    return {
      valid: true,
      message: 'Verification successful',
    };
  }

  async sendVerificationEmail(email: string): Promise<void> {
    const code = await this.generateVerificationCode(email);
    this.logger.log(`Sending verification email to ${email}`);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Xác thực email - Mã xác minh',
      template: './verification',
      context: { code },
    });
  }

  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.verifyModel.updateMany(
      { email, type: VerifyType.PASSWORD_RESET, isUsed: false },
      { isUsed: true },
    );

    await this.verifyModel.create({
      email,
      code: hashOtpCode(otp),
      type: VerifyType.PASSWORD_RESET,
      isUsed: false,
      expiresAt,
    });

    this.logger.log(`Sending password reset email to ${email}`);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Đặt lại mật khẩu - OTP',
      template: './password-reset',
      context: { otp },
    });
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
      { email, code: hashOtpCode(code) },
      { isUsed: true },
    );
  }

  async cleanupExpiredCodes(): Promise<number> {
    const result = await this.verifyModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    this.logger.log(
      `Cleaned up ${result.deletedCount} expired verification codes`,
    );
    return result.deletedCount;
  }
}
