import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Otp, OtpDocument } from '../schemas/otp.schema';
import { generateOtpCode } from '../utils/otp.utils';
import {
  hashOtpCode,
  verifyOtpCode,
} from '../../../common/utils/otp-hash.util';

const INVALID_OTP_MESSAGE = 'OTP is invalid or has expired.';

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
  hashOtp(otp: string): string {
    return hashOtpCode(otp);
  }

  async createOtp(
    email: string,
    otpPlaintext: string,
    ttlMs: number,
  ): Promise<void> {
    const hashedOtp = this.hashOtp(otpPlaintext);
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
    const storedCodeHash = otpRecord?.code ?? hashOtpCode('000000');
    const isValid = verifyOtpCode(otpPlaintext, storedCodeHash);
    if (!otpRecord || !isValid) {
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }
  }

  async consumeVerifiedOtp(
    email: string,
    otpPlaintext: string,
  ): Promise<OtpDocument> {
    const otpRecord = await this.getLatestActiveOtp(email);
    const storedCodeHash = otpRecord?.code ?? hashOtpCode('000000');
    const isValid = verifyOtpCode(otpPlaintext, storedCodeHash);
    if (!otpRecord || !isValid) {
      throw new BadRequestException(INVALID_OTP_MESSAGE);
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
      throw new BadRequestException(INVALID_OTP_MESSAGE);
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
