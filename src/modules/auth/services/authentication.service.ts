import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InviteService } from '@/modules/workspaces/services/invite.service';
import { EMAIL_POLICY } from '../../../common/constants/email-policy.constants';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { VerifyType } from '../../verify/dtos/verify.dto';
import { VerifyService } from '../../verify/services/verify.service';
import { LoginDto, RegisterDto } from '../dtos/auth.dto';
import { AuthErrorFactory } from '../utils/auth-error.factory';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly verifyService: VerifyService,
    private readonly inviteService: InviteService,
  ) {}

  async register(registerDto: RegisterDto) {
    this.logger.log(
      `Starting registration flow for email: ${registerDto.email}`,
    );

    try {
      const existingUser = await this.usersService.findByEmail(
        registerDto.email,
      );
      if (
        existingUser &&
        existingUser.status === USER_STATUSES.PENDING_VERIFICATION
      ) {
        // Use BadRequestException for validation errors, not ForbiddenException
        throw new BadRequestException({
          message: 'Please verify your email before registering.',
          code: AuthErrorFactory.emailNotVerified().code,
        });
      } else if (existingUser) {
        this.logger.warn(
          `Registration failed: Email ${registerDto.email} already exists.`,
        );
        throw new ConflictException('Email is already in use.');
      }

      const newUser = await this.usersService.createUser({
        email: registerDto.email,
        password: registerDto.password,
        role: GLOBAL_ROLES.USER,
        status: USER_STATUSES.PENDING_VERIFICATION,
      });
      this.logger.log(
        `User created successfully: ${newUser.email} (ID: ${newUser._id})`,
      );

      await this.verifyService.sendVerificationEmail(registerDto.email);
      this.logger.log(`Verification email sent to: ${registerDto.email}`);

      this.inviteService
        .processPostRegisterInvites(registerDto.email, newUser._id.toString())
        .catch((err: Error) =>
          this.logger.error('processPostRegisterInvites failed', err.stack),
        );

      return {
        success: true,
        message:
          'Registration successful. Please check your email to verify your account.',
        email: registerDto.email,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      if (!(error instanceof ConflictException)) {
        this.logger.error(
          `Unexpected error during registration (${registerDto.email}): ${message}`,
          stack,
        );
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    this.logger.log(`Login requested for email: ${loginDto.email}`);

    try {
      if (!EMAIL_POLICY.noWhitespacePattern.test(loginDto.email)) {
        throw new BadRequestException(EMAIL_POLICY.noWhitespaceMessage);
      }

      const user = await this.usersService.findByEmail(loginDto.email);

      // === Handle non-existent user ===
      // Return same response shape as a real wrong password to prevent user enumeration.
      if (!user) {
        this.logger.warn(
          `Login failed: Email ${loginDto.email} was not found.`,
        );
        const fakeRemaining = PASSWORD_POLICY.maxFailedAttempts - 1;
        throw new UnauthorizedException(
          AuthErrorFactory.invalidCredentials(fakeRemaining),
        );
      }

      // === Handle OAuth (no password) user ===
      // Return generic invalid credentials to prevent OAuth account enumeration.
      if (!user.password) {
        this.logger.warn(
          `Login failed: Account ${loginDto.email} has no password (OAuth).`,
        );
        const fakeRemaining = PASSWORD_POLICY.maxFailedAttempts - 1;
        throw new UnauthorizedException(
          AuthErrorFactory.invalidCredentials(fakeRemaining),
        );
      }

      // === Handle locked account ===
      const now = new Date();
      if (user.lockoutUntil && user.lockoutUntil.getTime() > now.getTime()) {
        this.logger.warn(
          `Login temporarily locked for email ${loginDto.email}.`,
        );
        throw new UnauthorizedException(
          AuthErrorFactory.accountLocked(user.lockoutUntil.toISOString()),
        );
      }

      // === Reset expired lockout ===
      if (user.lockoutUntil && user.lockoutUntil.getTime() <= now.getTime()) {
        await this.usersService.resetLoginFailures(user._id.toString());
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
        const failureState = await this.usersService.registerFailedLoginAttempt(
          user._id.toString(),
        );

        if (failureState.isLocked) {
          throw new UnauthorizedException(
            AuthErrorFactory.accountLocked(failureState.lockedUntil!),
          );
        }

        throw new UnauthorizedException(
          AuthErrorFactory.invalidCredentials(failureState.remainingAttempts),
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

      // === Clear any stale failures ===
      if (user.failedLoginAttempts || user.lockoutUntil) {
        await this.usersService.resetLoginFailures(user._id.toString());
      }

      // === Issue tokens ===
      const { accessToken, refreshToken } =
        await this.tokenService.createAndSaveTokens(
          user._id.toString(),
          user.email,
          user.role,
          user.fullName,
          user.avatar,
        );

      this.logger.log(`Login successful: ${user.email} (ID: ${user._id})`);

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
        !(error instanceof BadRequestException)
      ) {
        this.logger.error(
          `System error during login (${loginDto.email}): ${message}`,
          stack,
        );
      }
      throw error;
    }
  }

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
