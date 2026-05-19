// 📁 src/modules/auth/controllers/password.controller.ts

import {
  Controller,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PasswordResetService } from '../services/password-reset.service';
import { RequestPasswordResetDto, ResetPasswordWithTokenDto, ResetPasswordWithOtpDto, VerifyOtpDto } from '../dtos/password-reset.dto';
import { Request as ExpressRequest } from 'express';
import { AuditLogService } from '../services/audit-log.service';

// Password recovery endpoints are attack targets, so they use explicit
// method-level throttles and never skip throttling at controller level.
@Controller('auth')
export class PasswordController {
  constructor(
    private readonly passwordResetService: PasswordResetService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // 🔑 Password reset — throttle: 3/15min (chống email bombing)
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @Post('request-password-reset')
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: ExpressRequest,
  ) {
    const result = await this.passwordResetService.requestPasswordReset(dto);
    this.auditLogService.logRequest(req, {
      type: 'PASSWORD_RESET_REQUESTED',
      severity: 'INFO',
      // Không log email để tránh tiết lộ qua log stream
    });
    return result;
  }

  // 🔢 Verify OTP — throttle: 5/min (chống brute-force OTP)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: ExpressRequest) {
    try {
      const result = await this.passwordResetService.verifyOtp(dto);
      this.auditLogService.logRequest(req, {
        type: 'OTP_VERIFIED',
        severity: 'INFO',
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: 'OTP_FAILED',
        severity: 'WARN',
      });
      throw error;
    }
  }

  // 🔒 Reset password với JWT token
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password/token')
  async resetPasswordWithToken(
    @Body() dto: ResetPasswordWithTokenDto,
    @Req() req: ExpressRequest,
  ) {
    try {
      const result = await this.passwordResetService.resetPasswordWithToken(dto);
      this.auditLogService.logRequest(req, {
        type: 'PASSWORD_RESET_COMPLETED',
        severity: 'INFO',
        metadata: { method: 'token' },
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: 'PASSWORD_RESET_FAILED',
        severity: 'WARN',
        metadata: { method: 'token', reason: (error as Error).message },
      });
      throw error;
    }
  }

  // 🔒 Reset password với OTP
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password/otp')
  async resetPasswordWithOtp(
    @Body() dto: ResetPasswordWithOtpDto,
    @Req() req: ExpressRequest,
  ) {
    try {
      const result = await this.passwordResetService.resetPasswordWithOtp(dto);
      this.auditLogService.logRequest(req, {
        type: 'PASSWORD_RESET_COMPLETED',
        severity: 'INFO',
        metadata: { method: 'otp' },
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: 'OTP_FAILED',
        severity: 'WARN',
        metadata: { method: 'otp-reset', reason: (error as Error).message },
      });
      throw error;
    }
  }
}
