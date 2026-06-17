import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { randomInt } from 'crypto';
import { VerifyService } from '../services/verify.service';
import { SendVerifyDto, CheckVerifyDto, VerifyType } from '../dtos/verify.dto';

@ApiTags('Verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send verification email or password reset' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async sendVerification(@Body() dto: SendVerifyDto) {
    const { email, type } = dto;

    if (type === VerifyType.VERIFICATION) {
      await this.verifyService.sendVerificationEmail(email);
    } else if (type === VerifyType.PASSWORD_RESET) {
      const otp = randomInt(100000, 1_000_000).toString();
      await this.verifyService.sendPasswordResetEmail(email, otp);
    }

    return {
      success: true,
      message: 'Verification email sent successfully. Please check your inbox.',
    };
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify code' })
  @ApiResponse({ status: 200, description: 'Code verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async checkCode(@Body() dto: CheckVerifyDto) {
    const { email, code, type } = dto;

    const result = await this.verifyService.verifyCode(email, code, type);

    return {
      success: result.valid,
      message: result.message,
    };
  }

  @Get('confirm')
  @ApiOperation({
    summary: 'Confirm email verification (redirect to frontend)',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Verification token',
  })
  @ApiResponse({ status: 302, description: 'Redirect to frontend' })
  async confirmEmail(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/auth/verify-success?token=${token}`);
  }

  @Get('resend')
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiQuery({ name: 'email', required: true })
  @ApiQuery({
    name: 'type',
    required: true,
    enum: ['verification', 'password-reset'],
  })
  @ApiResponse({ status: 200, description: 'Verification code resent' })
  async resendCode(@Query('email') email: string, @Query('type') type: string) {
    if (type === 'verification') {
      await this.verifyService.sendVerificationEmail(email);
    } else if (type === 'password-reset') {
      const otp = randomInt(100000, 1_000_000).toString();
      await this.verifyService.sendPasswordResetEmail(email, otp);
    }

    return {
      success: true,
      message: 'New verification code has been sent',
    };
  }
}
