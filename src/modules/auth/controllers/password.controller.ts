import {
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest } from 'express';

import { AuditLogService } from '../../audit/services/audit-log.service';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { PasswordResetService } from '../services/password-reset.service';
import {
  RequestPasswordResetDto,
  ResetPasswordWithGrantDto,
  VerifyOtpDto,
} from '../dtos/password-reset.dto';

@Controller('auth')
export class PasswordController {
  constructor(
    private readonly passwordResetService: PasswordResetService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @Post('request-password-reset')
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: ExpressRequest,
  ) {
    const result = await this.passwordResetService.requestPasswordReset(dto);
    this.auditLogService.logRequest(req, {
      type: SECURITY_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      severity: 'INFO',
    });
    return result;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: ExpressRequest) {
    try {
      const result = await this.passwordResetService.verifyOtpAndIssueGrant(dto);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.OTP_VERIFIED_GRANT_ISSUED,
        severity: 'INFO',
        metadata: { expiresIn: result.expiresIn },
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.OTP_VERIFY_FAILED,
        severity: 'WARN',
      });
      throw error;
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(
    @Body() dto: ResetPasswordWithGrantDto,
    @Req() req: ExpressRequest,
  ) {
    try {
      const result = await this.passwordResetService.resetPasswordWithGrant(dto);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
        severity: 'INFO',
        metadata: { method: 'grant' },
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.PASSWORD_RESET_FAILED,
        severity: 'WARN',
        metadata: { method: 'grant', reason: (error as Error).message },
      });
      throw error;
    }
  }
}
