import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Otp, OtpDocument } from '../schemas/otp.schema';
import { generateOtpCode } from '../utils/otp.utils';

@Injectable()
export class OtpService {
  constructor(
    @InjectModel(Otp.name) private readonly otpModel: Model<OtpDocument>,
  ) {}

  /** SEC-5: OTP cryptographically secure */
  generateOtp(): string {
    return generateOtpCode();
  }

  /** SEC-6: Hash OTP before persist */
  async hashOtp(otp: string): Promise<string> {
    return bcrypt.hash(otp, 10);
  }

  async createOtp(email: string, otpPlaintext: string, ttlMs: number): Promise<void> {
    const hashedOtp = await this.hashOtp(otpPlaintext);
    await this.otpModel.create({
      email,
      code: hashedOtp,
      expiresAt: new Date(Date.now() + ttlMs),
      isUsed: false,
    });
  }

  /** latest unused + unexpired */
  async getLatestActiveOtp(email: string): Promise<OtpDocument | null> {
    return this.otpModel
      .findOne({ email, isUsed: false, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .exec();
  }

  async verifyOtp(email: string, otpPlaintext: string): Promise<void> {
    const otpRecord = await this.getLatestActiveOtp(email);
    const isValid = otpRecord && (await bcrypt.compare(otpPlaintext, otpRecord.code));
    if (!isValid) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }
  }

  async consumeVerifiedOtp(email: string, otpPlaintext: string): Promise<OtpDocument> {
    const otpRecord = await this.getLatestActiveOtp(email);
    const isValid = otpRecord && (await bcrypt.compare(otpPlaintext, otpRecord.code));
    if (!isValid) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const consumed = await this.otpModel.findOneAndUpdate(
      {
        _id: otpRecord._id,
        isUsed: false,
        expiresAt: { $gt: new Date() },
      },
      { $set: { isUsed: true } },
      { new: false },
    );

    if (!consumed) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    return consumed;
  }

  async markUsed(otpId: string): Promise<void> {
    await this.otpModel.updateOne({ _id: otpId }, { isUsed: true });
  }

  async invalidateOtp(email: string): Promise<void> {
    await this.otpModel.updateMany({ email, isUsed: false }, { isUsed: true });
  }
}
