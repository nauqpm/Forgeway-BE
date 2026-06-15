import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { UsersService } from '../../users/services/users.service';
import { VerifyService } from '../../verify/services/verify.service';
import {
  RequestPasswordResetDto,
  ResetPasswordWithGrantDto,
  VerifyOtpDto,
} from '../dtos/password-reset.dto';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly passwordService: PasswordService,
    private readonly verifyService: VerifyService,
  ) {}

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    this.logger.log(`Password reset requested for email: ${dto.email}`);

    const genericResponse = {
      success: true,
      message: 'If the email is valid, a password reset OTP has been sent.',
    };

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(
        `Password reset requested for non-existent email: ${dto.email}`,
      );
      return genericResponse;
    }

    this.logger.debug(
      `Generating password reset OTP for userId: ${String(user._id)}`,
    );
    const otp = this.otpService.generateOtp();
    await this.otpService.createOtp(dto.email, otp, 15 * 60 * 1000);
    this.logger.debug(`Password reset OTP stored for email: ${dto.email}`);

    await this.verifyService.sendPasswordResetEmail(dto.email, otp);
    this.logger.log(
      `Password reset OTP email dispatched for userId: ${String(user._id)}`,
    );

    return genericResponse;
  }

  async verifyOtpAndIssueGrant(dto: VerifyOtpDto): Promise<{
    success: boolean;
    resetGrant: string;
    expiresIn: number;
    message: string;
  }> {
    this.logger.log(
      `Password reset OTP verification requested for email: ${dto.email}`,
    );

    await this.otpService.consumeVerifiedOtp(dto.email, dto.otp);
    this.logger.debug(`Password reset OTP consumed for email: ${dto.email}`);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(
        `Password reset OTP verified but user was not found: ${dto.email}`,
      );
      throw new BadRequestException('OTP is invalid or has expired.');
    }

    const { resetGrant, expiresInMs } =
      await this.tokenService.createResetGrant(user._id.toString(), user.email);

    this.logger.log(
      `Password reset grant issued for userId: ${String(user._id)}; expiresInMs: ${expiresInMs}`,
    );
    return {
      success: true,
      resetGrant,
      expiresIn: expiresInMs,
      message: 'OTP verification successful.',
    };
  }

  async resetPasswordWithGrant(dto: ResetPasswordWithGrantDto) {
    this.logger.log('Password reset with grant requested');

    const { email } = await this.tokenService.validateResetGrant(
      dto.resetGrant,
    );
    this.logger.debug(`Password reset grant validated for email: ${email}`);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn(
        `Password reset grant validated but user was not found: ${email}`,
      );
      throw new NotFoundException('User not found.');
    }

    const isSameAsCurrentPassword = user.password
      ? await this.passwordService.verifyPassword(
          dto.newPassword,
          user.password,
        )
      : false;
    if (isSameAsCurrentPassword) {
      this.logger.warn(
        `Password reset rejected because new password matches current password for userId: ${String(user._id)}`,
      );
      throw new BadRequestException(
        'The new password must be different from the current password.',
      );
    }

    const consumedGrant = await this.tokenService.consumeResetGrant(
      dto.resetGrant,
    );
    if (consumedGrant.email !== email) {
      this.logger.error(
        `Password reset grant email mismatch during consume for userId: ${String(user._id)}`,
      );
      throw new BadRequestException('Reset grant is invalid.');
    }
    this.logger.debug(`Password reset grant consumed for email: ${email}`);

    const hashedPassword = await this.passwordService.hashPassword(
      dto.newPassword,
    );
    await this.usersService.updatePassword(email, hashedPassword);
    this.logger.log(`Password updated for userId: ${String(user._id)}`);

    await this.tokenService.invalidateAllTokensForUser(user._id.toString());
    this.logger.log(
      `Existing sessions invalidated after password reset for userId: ${String(user._id)}`,
    );

    return { success: true, message: 'Password has been reset successfully.' };
  }
}
