import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { VerifyType } from '../../verify/dtos/verify.dto';
import { VerifyService } from '../../verify/services/verify.service';

@Injectable()
export class RegistrationVerificationService {
  private readonly logger = new Logger(RegistrationVerificationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly verifyService: VerifyService,
  ) {}

  async verifyRegistrationEmail(email: string, code: string) {
    this.logger.log(`Starting registration email verification for: ${email}`);
    await this.verifyService.verifyCode(email, code, VerifyType.VERIFICATION);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.error(
        `Verification succeeded but no user was found for email: ${email}`,
      );
      throw new UnauthorizedException(
        'The verification code is invalid or has expired.',
      );
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      await this.usersService.updateUser(user._id.toString(), {
        status: USER_STATUSES.ACTIVE,
      });
      this.logger.log(
        `Account ${email} was activated successfully (status -> ACTIVE)`,
      );
    } else {
      this.logger.log(`Account ${email} was already ACTIVE.`);
    }

    return {
      success: true,
      message: 'Email verification successful.',
    };
  }

  async resendRegistrationVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (user && user.status === USER_STATUSES.PENDING_VERIFICATION) {
      await this.verifyService.sendVerificationEmail(email);
    }

    return {
      success: true,
      message:
        'If the email requires verification, new instructions have been sent.',
    };
  }
}
