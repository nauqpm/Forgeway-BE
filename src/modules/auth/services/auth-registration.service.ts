import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { VerifyService } from '../../verify/services/verify.service';
import { InviteService } from '@/modules/workspaces/services/invite.service';
import { RegisterDto } from '../dtos/auth.dto';
import { AuthErrorFactory } from '../utils/auth-error.factory';

@Injectable()
export class AuthRegistrationService {
  private readonly logger = new Logger(AuthRegistrationService.name);

  constructor(
    private readonly usersService: UsersService,
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
        `User created successfully: ${newUser.email} (ID: ${String(newUser._id)})`,
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
}
