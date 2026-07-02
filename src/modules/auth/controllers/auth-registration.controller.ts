import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest } from 'express';

import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import {
  RegisterDto,
  ResendVerificationDto,
  VerifyEmailDto,
} from '../dtos/auth.dto';
import { AuthRegistrationService } from '../services/auth-registration.service';
import { RegistrationVerificationService } from '../services/registration-verification.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthRegistrationController {
  private readonly logger = new Logger(AuthRegistrationController.name);

  constructor(
    private readonly authRegistrationService: AuthRegistrationService,
    private readonly registrationVerificationService: RegistrationVerificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @ApiOperation({ summary: 'Check email before registration' })
  @ApiResponse({
    status: 200,
    description: 'Email is valid for registration',
    schema: {
      example: {
        success: true,
        message: 'You can proceed with registration.',
      },
    },
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('check-email')
  checkEmail(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    return {
      success: true,
      message: 'You can proceed with registration.',
    };
  }

  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful, verification email sent',
    schema: {
      example: {
        success: true,
        message:
          'Registration successful. Please check your email to verify your account.',
        email: 'user@example.com',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error or email already pending verification',
    schema: {
      example: {
        statusCode: 400,
        message: 'Please verify your email before registering.',
        code: 'EMAIL_NOT_VERIFIED',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
    schema: {
      example: {
        statusCode: 401,
        message: 'Email or password is incorrect.',
        code: 'INVALID_CREDENTIALS',
      },
    },
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: ExpressRequest) {
    this.logger.log('Starting user registration...');

    try {
      const result = await this.authRegistrationService.register(registerDto);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REGISTER_SUCCESS,
        severity: 'INFO',
        email: registerDto.email,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Registration failed (${registerDto.email}): ${message}`,
        stack,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REGISTER_FAILED,
        severity: 'WARN',
        email: registerDto.email,
        metadata: { reason: message },
      });
      throw error;
    }
  }

  @ApiOperation({ summary: 'Verify registration email' })
  @ApiResponse({
    status: 200,
    description: 'Email verification successful',
    schema: {
      example: {
        success: true,
        message: 'Email verification successful.',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification code',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: ExpressRequest) {
    try {
      const result =
        await this.registrationVerificationService.verifyRegistrationEmail(
          dto.email,
          dto.code,
        );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.EMAIL_VERIFICATION_SUCCESS,
        severity: 'INFO',
        email: dto.email,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.EMAIL_VERIFICATION_FAILED,
        severity: 'WARN',
        email: dto.email,
        metadata: { reason: message },
      });
      throw error;
    }
  }

  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({
    status: 200,
    description: 'Verification email resent if account is pending',
    schema: {
      example: {
        success: true,
        message:
          'If the email requires verification, new instructions have been sent.',
      },
    },
  })
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() req: ExpressRequest,
  ) {
    try {
      const result =
        await this.registrationVerificationService.resendRegistrationVerification(
          dto.email,
        );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.EMAIL_VERIFICATION_RESENT,
        severity: 'INFO',
        email: dto.email,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.EMAIL_VERIFICATION_RESEND_FAILED,
        severity: 'WARN',
        email: dto.email,
        metadata: { reason: message },
      });
      throw error;
    }
  }
}
