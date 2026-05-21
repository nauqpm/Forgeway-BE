import {
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest } from 'express';

import { AuditLogService } from '../services/audit-log.service';
import { PasswordResetService } from '../services/password-reset.service';
import {
  RequestPasswordResetDto,
  ResetPasswordWithGrantDto,
  VerifyOtpDto,
} from '../dtos/password-reset.dto';

@ApiTags('Auth - Password')
@Controller('auth')
export class PasswordController {
  constructor(
    private readonly passwordResetService: PasswordResetService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @ApiOperation({ summary: 'Yêu cầu đặt lại mật khẩu' })
  @ApiResponse({
    status: 201,
    description: 'Gửi OTP qua email thành công',
    schema: {
      example: {
        success: true,
        message: 'OTP đã được gửi đến email của bạn.',
      },
    },
  })
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
    });
    return result;
  }

  @ApiOperation({ summary: 'Xác thực OTP và nhận grant token' })
  @ApiResponse({
    status: 201,
    description: 'OTP hợp lệ, trả về grant token để đặt lại mật khẩu',
    schema: {
      example: {
        success: true,
        grantToken: '...',
        expiresIn: 300,
      },
    },
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: ExpressRequest) {
    try {
      const result = await this.passwordResetService.verifyOtpAndIssueGrant(dto);
      this.auditLogService.logRequest(req, {
        type: 'OTP_VERIFIED_GRANT_ISSUED',
        severity: 'INFO',
        metadata: { expiresIn: result.expiresIn },
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: 'OTP_VERIFY_FAILED',
        severity: 'WARN',
      });
      throw error;
    }
  }

  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng grant token' })
  @ApiResponse({
    status: 201,
    description: 'Đặt lại mật khẩu thành công',
    schema: {
      example: {
        success: true,
        message: 'Mật khẩu đã được đặt lại thành công.',
      },
    },
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(
    @Body() dto: ResetPasswordWithGrantDto,
    @Req() req: ExpressRequest,
  ) {
    try {
      const result = await this.passwordResetService.resetPasswordWithGrant(dto);
      this.auditLogService.logRequest(req, {
        type: 'PASSWORD_RESET_COMPLETED',
        severity: 'INFO',
        metadata: { method: 'grant' },
      });
      return result;
    } catch (error) {
      this.auditLogService.logRequest(req, {
        type: 'PASSWORD_RESET_FAILED',
        severity: 'WARN',
        metadata: { method: 'grant', reason: (error as Error).message },
      });
      throw error;
    }
  }
}

