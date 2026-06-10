import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { AUTH_ERROR_CODES } from '../constants/auth-error.constants';
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
    this.logger.log(`Starting registration flow for email: ${registerDto.email}`);

    try {
      const existingUser = await this.usersService.findByEmail(registerDto.email);
      if (existingUser && existingUser.status === USER_STATUSES.PENDING_VERIFICATION) {
        throw new ForbiddenException({
          message: 'Please verify your email before registering.',
          code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        });
      } else if (existingUser) {
        this.logger.warn(`Registration failed: Email ${registerDto.email} already exists.`);
        throw new ConflictException('Email is already in use.');
      }

      const newUser = await this.usersService.createUser({
        email: registerDto.email,
        password: registerDto.password,
        role: GLOBAL_ROLES.USER,
        status: USER_STATUSES.PENDING_VERIFICATION,
      });
      this.logger.log(`User created successfully: ${newUser.email} (ID: ${newUser._id})`);

      await this.verifyService.sendVerificationEmail(registerDto.email);
      this.logger.log(`Verification email sent to: ${registerDto.email}`);

      this.inviteService
        .processPostRegisterInvites(registerDto.email, newUser._id.toString())
        .catch((err: Error) =>
          this.logger.error('processPostRegisterInvites failed', err.stack),
        );

      return {
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        email: registerDto.email,
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (!(error instanceof ConflictException)) {
        this.logger.error(
          `Unexpected error during registration (${registerDto.email}): ${err.message}`,
          err.stack,
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
      if (!user) {
        this.logger.warn(`Login failed: Email ${loginDto.email} was not found.`);
        throw new UnauthorizedException({
          message: 'Email or password is incorrect.',
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          details: {
            remainingAttempts: 0,
            maxAttempts: PASSWORD_POLICY.maxFailedAttempts,
          },
        });
      }

      if (!user.password) {
        this.logger.warn(`Login failed: Account ${loginDto.email} uses Google OAuth.`);
        throw new UnauthorizedException(
          'This account was registered with Google. Please sign in with Google.',
        );
      }

      const now = new Date();
      if (user.lockoutUntil && user.lockoutUntil.getTime() > now.getTime()) {
        this.logger.warn(`Login temporarily locked for email ${loginDto.email}.`);
        throw new UnauthorizedException({
          message:
            'Account has been temporarily locked due to too many failed password attempts.',
          code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
          details: {
            lockedUntil: user.lockoutUntil.toISOString(),
            remainingAttempts: 0,
            maxAttempts: PASSWORD_POLICY.maxFailedAttempts,
          },
        });
      }

      if (user.lockoutUntil && user.lockoutUntil.getTime() <= now.getTime()) {
        await this.usersService.resetLoginFailures(user._id.toString());
        user.failedLoginAttempts = 0;
        user.lockoutUntil = undefined;
      }

      const isPasswordValid = await this.passwordService.verifyPassword(
        loginDto.password,
        user.password,
      );
      if (!isPasswordValid) {
        this.logger.warn(`Login failed: Incorrect password for email ${loginDto.email}.`);
        const failureState = await this.usersService.registerFailedLoginAttempt(user);

        if (failureState.isLocked) {
          throw new UnauthorizedException({
            message:
              'Account has been temporarily locked due to too many failed password attempts.',
            code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            details: {
              lockedUntil: failureState.lockedUntil,
              remainingAttempts: failureState.remainingAttempts,
              maxAttempts: failureState.maxAttempts,
            },
          });
        }

        throw new UnauthorizedException({
          message: 'Email or password is incorrect.',
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          details: {
            remainingAttempts: failureState.remainingAttempts,
            maxAttempts: failureState.maxAttempts,
          },
        });
      }

      if (user.status !== USER_STATUSES.ACTIVE) {
        this.logger.warn(
          `Login failed: Account ${loginDto.email} is not active yet (status: ${user.status}).`,
        );

        if (user.status === USER_STATUSES.PENDING_VERIFICATION) {
          throw new UnauthorizedException({
            message: 'Please verify your email before signing in.',
            code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
          });
        }

        const code =
          user.status === USER_STATUSES.BANNED
            ? AUTH_ERROR_CODES.USER_SUSPENDED
            : AUTH_ERROR_CODES.USER_DEACTIVATED;
        throw new UnauthorizedException({
          message: 'Account has been locked or suspended.',
          code,
        });
      }

      if (user.failedLoginAttempts || user.lockoutUntil) {
        await this.usersService.resetLoginFailures(user._id.toString());
      }

      const { accessToken, refreshToken } = await this.tokenService.createAndSaveTokens(
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
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (!(error instanceof UnauthorizedException) && !(error instanceof BadRequestException)) {
        this.logger.error(`System error during login (${loginDto.email}): ${err.message}`, err.stack);
      }
      throw error;
    }
  }

  async verifyRegistrationEmail(email: string, code: string) {
    this.logger.log(`Starting registration email verification for: ${email}`);
    await this.verifyService.verifyCode(email, code, VerifyType.VERIFICATION);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.error(`Verification succeeded but no user was found for email: ${email}`);
      throw new UnauthorizedException('The verification code is invalid or has expired.');
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      await this.usersService.updateUser(user._id.toString(), {
        status: USER_STATUSES.ACTIVE,
      });
      this.logger.log(`Account ${email} was activated successfully (status -> ACTIVE)`);
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
      message: 'If the email requires verification, new instructions have been sent.',
    };
  }
}
