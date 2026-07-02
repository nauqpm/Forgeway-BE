import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EMAIL_POLICY } from '../../../common/constants/email-policy.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { LoginDto } from '../dtos/auth.dto';
import { AuthErrorFactory } from '../utils/auth-error.factory';
import {
  LoginAttemptContext,
  LoginAttemptThrottleService,
} from '../security/login-attempt-throttle.service';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class CredentialLoginService implements OnModuleInit {
  private readonly logger = new Logger(CredentialLoginService.name);
  private dummyPasswordHash = '';

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly loginAttemptThrottleService: LoginAttemptThrottleService,
  ) {}

  async onModuleInit() {
    this.dummyPasswordHash =
      await this.passwordService.hashPassword(randomUUID());
  }

  private async runDummyPasswordCompare(password: string) {
    if (!this.dummyPasswordHash) {
      this.dummyPasswordHash =
        await this.passwordService.hashPassword(randomUUID());
    }
    await this.passwordService.verifyPassword(password, this.dummyPasswordHash);
  }

  private throwPublicLoginFailure(retryAfterSeconds = 0): never {
    throw new UnauthorizedException(
      AuthErrorFactory.publicLoginFailure(retryAfterSeconds),
    );
  }

  private async registerLoginFailure(
    context: LoginAttemptContext,
  ): Promise<number> {
    const failure =
      await this.loginAttemptThrottleService.registerFailure(context);
    return failure.retryAfterSeconds;
  }

  async login(loginDto: LoginDto, requestContext: { ip: string }) {
    this.logger.log(`Login requested for email: ${loginDto.email}`);

    try {
      if (!EMAIL_POLICY.noWhitespacePattern.test(loginDto.email)) {
        throw new BadRequestException(EMAIL_POLICY.noWhitespaceMessage);
      }

      const attemptContext: LoginAttemptContext = {
        email: loginDto.email,
        ip: requestContext.ip,
      };
      const retryAfterSeconds =
        await this.loginAttemptThrottleService.getRetryAfterSeconds(
          attemptContext,
        );
      if (retryAfterSeconds > 0) {
        throw new LoginRetryLaterException(retryAfterSeconds);
      }

      const user = await this.usersService.findByEmail(loginDto.email);

      // === Handle non-existent user ===
      // Return same response shape as a real wrong password to prevent user enumeration.
      if (!user) {
        this.logger.warn(
          `Login failed: Email ${loginDto.email} was not found.`,
        );
        await this.runDummyPasswordCompare(loginDto.password);
        this.throwPublicLoginFailure(
          await this.registerLoginFailure(attemptContext),
        );
      }

      // === Handle OAuth (no password) user ===
      // Return generic invalid credentials to prevent OAuth account enumeration.
      if (!user.password) {
        this.logger.warn(
          `Login failed: Account ${loginDto.email} has no password (OAuth).`,
        );
        await this.runDummyPasswordCompare(loginDto.password);
        this.throwPublicLoginFailure(
          await this.registerLoginFailure(attemptContext),
        );
      }

      // === Verify password ===
      const isPasswordValid = await this.passwordService.verifyPassword(
        loginDto.password,
        user.password,
      );

      if (!isPasswordValid) {
        this.logger.warn(
          `Login failed: Incorrect password for email ${loginDto.email}.`,
        );
        this.throwPublicLoginFailure(
          await this.registerLoginFailure(attemptContext),
        );
      }

      // === Handle non-active status ===
      if (user.status !== USER_STATUSES.ACTIVE) {
        this.logger.warn(
          `Login failed: Account ${loginDto.email} is not active (status: ${user.status}).`,
        );

        if (user.status === USER_STATUSES.PENDING_VERIFICATION) {
          throw new UnauthorizedException(AuthErrorFactory.emailNotVerified());
        }

        throw new UnauthorizedException(
          user.status === USER_STATUSES.BANNED
            ? AuthErrorFactory.accountSuspended()
            : AuthErrorFactory.accountDeactivated(),
        );
      }

      await this.loginAttemptThrottleService.clear(attemptContext);

      // === Issue tokens ===
      const { accessToken, refreshToken } =
        await this.tokenService.createAndSaveTokens(
          user._id.toString(),
          user.email,
          user.role,
          user.fullName,
          user.avatar,
        );

      this.logger.log(
        `Login successful: ${user.email} (ID: ${String(user._id)})`,
      );

      return {
        success: true,
        message: 'Sign-in successful.',
        tokens: { accessToken, refreshToken },
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          fullName: user.fullName,
          avatar: user.avatar,
          googleId: user.googleId,
          ssoProvider: user.googleId ? 'google' : undefined,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      if (
        !(error instanceof UnauthorizedException) &&
        !(error instanceof BadRequestException) &&
        !(error instanceof LoginRetryLaterException)
      ) {
        this.logger.error(
          `System error during login (${loginDto.email}): ${message}`,
          stack,
        );
      }
      throw error;
    }
  }
}
