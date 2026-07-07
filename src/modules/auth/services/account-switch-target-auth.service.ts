import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { SwitchCredentialDto } from '../dtos/switch-account.dto';
import { LoginAttemptThrottleService } from '../security/login-attempt-throttle.service';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { AuthErrorFactory } from '../utils/auth-error.factory';
import { PasswordService } from './password.service';

export interface AccountSwitchTargetUser {
  _id: { toString(): string };
  email: string;
  password?: string | null;
  fullName?: string;
  avatar?: string;
  role: string;
  googleId?: string | null;
  status: string;
}

@Injectable()
export class AccountSwitchTargetAuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly loginAttemptThrottleService: LoginAttemptThrottleService,
  ) {}

  async verifyTargetCredential(
    targetAccountId: string,
    credential: SwitchCredentialDto,
    context: { ip?: string },
  ): Promise<AccountSwitchTargetUser> {
    const targetUser = (await this.usersService.getUserById(
      targetAccountId,
    )) as AccountSwitchTargetUser;

    if (targetUser.status !== USER_STATUSES.ACTIVE) {
      throw new ForbiddenException('Account đích hiện không khả dụng');
    }

    if (credential.type !== 'password') {
      throw new BadRequestException('Unsupported account switch credential');
    }

    if (!targetUser.password) {
      throw new BadRequestException({
        code: 'SSO_REQUIRED',
        message: 'SSO_REQUIRED',
      });
    }

    const attemptContext = {
      email: targetUser.email,
      ip: context.ip ?? 'unknown',
    };
    const retryAfterSeconds =
      await this.loginAttemptThrottleService.getRetryAfterSeconds(
        attemptContext,
      );
    if (retryAfterSeconds > 0) {
      throw new LoginRetryLaterException(retryAfterSeconds);
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      credential.password ?? '',
      targetUser.password,
    );

    if (!isPasswordValid) {
      const failure =
        await this.loginAttemptThrottleService.registerFailure(attemptContext);
      throw new UnauthorizedException(
        AuthErrorFactory.publicLoginFailure(failure.retryAfterSeconds),
      );
    }

    await this.loginAttemptThrottleService.clear(attemptContext);
    return targetUser;
  }
}
