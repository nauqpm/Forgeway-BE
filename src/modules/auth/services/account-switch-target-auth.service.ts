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
import { AccountSwitchSecurityAlertService } from './account-switch-security-alert.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';

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
    private readonly securityAlertService: AccountSwitchSecurityAlertService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async verifyTargetCredential(
    targetAccountId: string,
    credential: SwitchCredentialDto,
    context: { ip?: string; deviceId?: string },
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
      if (failure.retryAfterSeconds > 0) {
        const notificationSent =
          await this.securityAlertService.sendTargetLockoutEmail({
            targetEmail: targetUser.email,
            ip: context.ip,
            deviceId: context.deviceId,
          });
        this.auditLogService.log({
          type: SECURITY_EVENT_TYPES.ACCOUNT_SWITCH_FAILED,
          severity: 'WARN',
          userId: targetUser._id.toString(),
          email: targetUser.email,
          metadata: {
            triggeredVia: 'account-switch',
            targetUserId: targetUser._id.toString(),
            notificationSent,
            reason: 'target-lockout',
          },
        });
      }
      throw new UnauthorizedException(
        AuthErrorFactory.publicLoginFailure(failure.retryAfterSeconds),
      );
    }

    await this.loginAttemptThrottleService.clear(attemptContext);
    return targetUser;
  }
}
