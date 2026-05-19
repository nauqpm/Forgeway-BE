import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { UsersService } from '../../users/services/users.service';
import { VerifyService } from '../../verify/services/verify.service';
import {
  RequestPasswordResetDto,
  ResetPasswordWithOtpDto,
  ResetPasswordWithTokenDto,
  VerifyOtpDto,
} from '../dtos/password-reset.dto';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { PasswordService } from './password.service';
import { PasswordResetJwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly passwordService: PasswordService,
    private readonly verifyService: VerifyService,
  ) {}

  /** 🔄 Yêu cầu đặt lại mật khẩu (behavior preserved) */
  async requestPasswordReset(dto: RequestPasswordResetDto) {
    // SEC-7: generic response
    const GENERIC_RESPONSE = {
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
    };

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return GENERIC_RESPONSE;
    }

    // SEC-10: sign reset token with PASSWORD_RESET_SECRET
    const resetToken = this.jwtService.sign(
      { email: dto.email, type: TOKEN_TYPES.PASSWORD_RESET },
      {
        secret: this.configService.get<string>('PASSWORD_RESET_SECRET'),
        expiresIn: '15m',
      },
    );

    // Persist hashed token (unchanged semantics)
    await this.tokenService.createPasswordResetTokenRecord(
      user._id.toString(),
      user.email,
      resetToken,
    );

    // OTP 15m
    const otp = this.otpService.generateOtp();
    await this.otpService.createOtp(dto.email, otp, 15 * 60 * 1000);

    await this.verifyService.sendPasswordResetEmail(dto.email, resetToken, otp);

    return GENERIC_RESPONSE;
  }

  /** ✅ Xác thực OTP */
  async verifyOtp(dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.email, dto.otp);
    return { success: true, message: 'Xác thực OTP thành công' };
  }

  /** 🔑 Đặt lại mật khẩu với token */
  async resetPasswordWithToken(dto: ResetPasswordWithTokenDto) {
    try {
      const payload = this.jwtService.verify<PasswordResetJwtPayload>(dto.token, {
        secret: this.configService.get<string>('PASSWORD_RESET_SECRET'),
      });
      if (!payload || payload.type !== TOKEN_TYPES.PASSWORD_RESET) {
        throw new BadRequestException('Token không hợp lệ');
      }

      const tokenRecord = await this.tokenService.consumePasswordResetToken(dto.token);

      if (!tokenRecord) {
        throw new BadRequestException('Token không hợp lệ hoặc đã được sử dụng');
      }

      const hashedPassword = await this.passwordService.hashPassword(dto.newPassword);
      await this.usersService.updatePassword(tokenRecord.email, hashedPassword);


      return { success: true, message: 'Đặt lại mật khẩu thành công' };
    } catch (error) {
      const err = error as Error;
      if (err.name === 'JsonWebTokenError') {
        throw new BadRequestException('Token không hợp lệ');
      }
      if (err.name === 'TokenExpiredError') {
        throw new BadRequestException('Token đã hết hạn');
      }
      throw error;
    }
  }

  /** 🔑 Đặt lại mật khẩu với OTP */
  async resetPasswordWithOtp(dto: ResetPasswordWithOtpDto) {
    const otpRecord = await this.otpService.getLatestActiveOtp(dto.email);
    const isValid = otpRecord && (await this.passwordService.verifyPassword(dto.otp, otpRecord.code));
    if (!isValid) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const hashedPassword = await this.passwordService.hashPassword(dto.newPassword);
    await this.usersService.updatePassword(dto.email, hashedPassword);

    await this.otpService.markUsed(String(otpRecord._id));

    return { success: true, message: 'Đặt lại mật khẩu thành công' };
  }
}
