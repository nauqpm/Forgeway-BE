// 📁 src/modules/auth/controllers/oauth.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
  UseGuards,
  Req,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { OAuthService } from '../services/oauth.service';
import { TokenService } from '../services/token.service';
import { AccountSwitcherService } from '../services/account-switcher.service';
import { RecentLoginsService } from '../services/recent-logins.service';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { Response, Request as ExpressRequest } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../audit/services/audit-log.service';
import {
  getDeviceIdFromRequest,
  setAuthCookies,
  setDeviceIdCookie,
} from '../utils/cookie.utils';
import { COOKIE_NAMES } from '../constants/cookie.constants';
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
    private readonly tokenService: TokenService,
    private readonly accountSwitcher: AccountSwitcherService,
    private readonly recentLoginsService: RecentLoginsService,
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
    description:
      'Callback từ Google sau khi xác thực. Token được set vào HttpOnly Cookie và redirect về frontend.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect về frontend dashboard sau khi đăng nhập thành công',
  })
  @Get('google/redirect')
  @SkipThrottle()
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: RequestWithUser, @Res() res: Response) {
    // // 🐛 DEBUG LOG — REMOVE AFTER PRODUCTION INVESTIGATION
    // console.log('=============== GOOGLE CALLBACK ====================');
    // console.log('Callback reached');
    // console.log('Query:', req.query);
    // console.log('Host:', req.headers.host);
    // console.log('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
    // console.log('X-Forwarded-Host:', req.headers['x-forwarded-host']);
    // console.log('===================================================');

    try {
      if (!req.user) {
        throw new BadRequestException('Google login failed');
      }

      // ✅ Phase 3: Nhận đủ access + refresh token (đồng nhất với login thường)
      const { user, accessToken, refreshToken } =
        await this.oauthService.validateGoogleUser(req.user);

      if (!user) {
        throw new BadRequestException('Xác thực Google thất bại');
      }

      // ✅ Set cả 2 HttpOnly cookies — token KHÔNG xuất hiện trên URL
      setAuthCookies(res, this.configService, { accessToken, refreshToken });

      // Hook: remember this Google account under any active session owner (populates switcher dropdown).
      const existingAccess = req.cookies?.[COOKIE_NAMES.ACCESS] as
        | string
        | undefined;
      const ownerUserId =
        this.tokenService.peekUserIdFromAccessToken(existingAccess);
      if (ownerUserId && ownerUserId !== user._id.toString()) {
        try {
          const ip =
            (req.headers['x-forwarded-for'] as string | undefined)
              ?.split(',')[0]
              ?.trim() ??
            req.ip ??
            undefined;
          const userAgent = req.headers['user-agent'] ?? undefined;
          await this.accountSwitcher.rememberAccount(
            ownerUserId,
            {
              id: user._id.toString(),
              email: user.email,
              fullName: user.fullName ?? undefined,
              avatar: user.avatar ?? undefined,
              role: user.role,
              ssoProvider: 'google',
            },
            { ip, userAgent },
          );
        } catch (rememberErr) {
          this.logger.warn(
            `rememberAccount failed (google): ${(rememberErr as Error).message}`,
          );
        }
      }

      // Hook: ghi nhận account này là "gần đây trên thiết bị" — luôn chạy,
      // kể cả khi không có owner cũ, để hiển thị "Tài khoản gần đây" sau logout.
      try {
        const ip =
          (req.headers['x-forwarded-for'] as string | undefined)
            ?.split(',')[0]
            ?.trim() ??
          req.ip ??
          undefined;
        const userAgent = req.headers['user-agent'] ?? undefined;
        let deviceId = getDeviceIdFromRequest(req);
        if (!deviceId) {
          deviceId = RecentLoginsService.generateDeviceId();
          setDeviceIdCookie(res, this.configService, deviceId);
        }
        await this.recentLoginsService.remember(
          deviceId,
          {
            id: user._id.toString(),
            email: user.email,
            fullName: user.fullName ?? undefined,
            avatar: user.avatar ?? undefined,
            role: user.role,
            ssoProvider: 'google',
          },
          { ip, userAgent },
        );
      } catch (recentErr) {
        this.logger.warn(
          `recentLogins.remember failed (google): ${(recentErr as Error).message}`,
        );
      }

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_SUCCESS,
        severity: 'INFO',
        email: user.email,
        metadata: { role: user.role },
      });

      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000';
      const dashboardUrl =
        this.configService.get<string>('FRONTEND_DASHBOARD_URL') ||
        `${frontendUrl}/dashboard`;
      const redirectUrl =
        user.role === GLOBAL_ROLES.SUPER_ADMIN
          ? dashboardUrl
          : `${frontendUrl}/`;

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error('❌ Lỗi xác thực Google:', error);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_FAILED,
        severity: 'WARN',
        metadata: { reason: (error as Error).message },
      });
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }

  @ApiOperation({
    summary: 'Google OAuth login for Mobile Apps',
    description:
      'Verify idToken directly from mobile client and return access/refresh tokens in body.',
  })
  @ApiResponse({ status: 200, description: 'Login successful via Google' })
  @ApiBody({
    schema: { type: 'object', properties: { idToken: { type: 'string' } } },
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('google/mobile')
  async googleAuthMobile(
    @Body('idToken') idToken: string,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idToken) {
      throw new BadRequestException('idToken is required');
    }

    try {
      const { user, accessToken, refreshToken } =
        await this.oauthService.verifyMobileGoogleToken(idToken);

      // Optionally set cookies as well if mobile web needs it
      setAuthCookies(res, this.configService, { accessToken, refreshToken });

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_SUCCESS,
        severity: 'INFO',
        email: user.email,
        metadata: { role: user.role, client: 'mobile' },
      });

      return {
        success: true,
        message: 'Google login successful',
        user,
        tokens: { accessToken, refreshToken },
      };
    } catch (error) {
      this.logger.error('❌ Google Mobile Auth error:', error);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_FAILED,
        severity: 'WARN',
        metadata: { reason: (error as Error).message, client: 'mobile' },
      });
      throw error;
    }
  }
}
