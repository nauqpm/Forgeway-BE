// 📁 src/modules/auth/controllers/oauth.controller.ts

import { Controller, Get, BadRequestException, UseGuards, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { OAuthService } from '../services/oauth.service';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { Response, Request as ExpressRequest } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { setAuthCookies } from '../utils/cookie.utils';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@ApiTags('Auth - OAuth')
@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // 👉 Chuyển hướng đến Google để xác thực
  // OAuth handoff is not credential-bearing; skip only this route explicitly.
  @ApiOperation({ summary: 'Chuyển hướng đến Google để đăng nhập' })
  @ApiResponse({
    status: 302,
    description: 'Redirect đến trang đăng nhập Google',
  })
  @Get('google')
  @SkipThrottle()
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return;
  }

  // 🔄 Google OAuth callback — cấp access + refresh token (đồng nhất với login thường)
  // Provider callbacks can burst during retries, so this skip is explicit and local.
  @ApiOperation({
    summary: 'Google OAuth callback',
    description: 'Callback từ Google sau khi xác thực. Token được set vào HttpOnly Cookie và redirect về frontend.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect về frontend dashboard sau khi đăng nhập thành công',
  })
  @Get('google/redirect')
  @SkipThrottle()
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: RequestWithUser, @Res() res: Response) {
    try {
      if (!req.user) {
        throw new BadRequestException('Google login failed');
      }

      // ✅ Phase 3: Nhận đủ access + refresh token (đồng nhất với login thường)
      const { user, accessToken, refreshToken } = await this.oauthService.validateGoogleUser(req.user);

      if (!user) {
        throw new BadRequestException('Xác thực Google thất bại');
      }

      // ✅ Set cả 2 HttpOnly cookies — token KHÔNG xuất hiện trên URL
      setAuthCookies(res, this.configService, { accessToken, refreshToken });

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_SUCCESS,
        severity: 'INFO',
        email: user.email,
        metadata: { role: user.role },
      });

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const dashboardUrl = this.configService.get<string>('FRONTEND_DASHBOARD_URL') || `${frontendUrl}/dashboard`;
      const redirectUrl = user.role === GLOBAL_ROLES.SUPER_ADMIN ? dashboardUrl : `${frontendUrl}/`;

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error('❌ Lỗi xác thực Google:', error);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_FAILED,
        severity: 'WARN',
        metadata: { reason: (error as Error).message },
      });
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }
}
