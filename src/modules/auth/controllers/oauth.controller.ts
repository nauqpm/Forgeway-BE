import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest, Response } from 'express';

import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { OAuthService } from '../services/oauth.service';
import { LoginSessionTrackingService } from '../services/login-session-tracking.service';
import { TokenService } from '../services/token.service';
import {
  getDeviceIdFromRequest,
  setAuthCookies,
  setDeviceIdCookie,
} from '../utils/cookie.utils';

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
    private readonly loginSessionTrackingService: LoginSessionTrackingService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @ApiOperation({ summary: 'Redirect to Google for sign-in' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google sign-in page',
  })
  @Get('google')
  @SkipThrottle()
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return;
  }

  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Handle the Google callback, set HttpOnly cookies, and redirect back to the frontend.',
  })
  @ApiResponse({
    status: 302,
    description:
      'Redirect back to the frontend after a successful Google login',
  })
  @Get('google/redirect')
  @SkipThrottle()
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: RequestWithUser, @Res() res: Response) {
    try {
      if (!req.user) {
        throw new BadRequestException('Google login failed');
      }

      const { user } = await this.oauthService.validateGoogleUser(req.user);

      if (!user) {
        throw new BadRequestException('Google authentication failed');
      }

      const finalTokens = await this.tokenService.createAndSaveTokens(
        user._id.toString(),
        user.email,
        user.role,
        user.fullName ?? undefined,
        user.avatar ?? undefined,
      );

      setAuthCookies(res, this.configService, {
        accessToken: finalTokens.accessToken,
        refreshToken: finalTokens.refreshToken,
      });

      const trackingResult =
        await this.loginSessionTrackingService.trackLoginSession({
          loggedInUser: {
            id: user._id.toString(),
            email: user.email,
            fullName: user.fullName ?? undefined,
            avatar: user.avatar ?? undefined,
            role: user.role,
            ssoProvider: 'google',
          },
          deviceId: getDeviceIdFromRequest(req) ?? undefined,
          ip:
            (req.headers['x-forwarded-for'] as string | undefined)
              ?.split(',')[0]
              ?.trim() ?? req.ip,
          userAgent: req.headers['user-agent'],
        });
      if (trackingResult.generatedDeviceId) {
        setDeviceIdCookie(
          res,
          this.configService,
          trackingResult.generatedDeviceId,
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
      this.logger.error('Google authentication failed', error);
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
    summary: 'Google OAuth login for mobile apps',
    description:
      'Verify idToken directly from the mobile client and return access and refresh tokens in the body.',
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
      const { user } = await this.oauthService.verifyMobileGoogleToken(idToken);

      const tokens = await this.tokenService.createAndSaveTokens(
        user._id.toString(),
        user.email,
        user.role,
        user.fullName,
        user.avatar,
      );

      setAuthCookies(res, this.configService, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });

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
        tokens,
      };
    } catch (error) {
      this.logger.error('Google mobile auth failed', error);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_FAILED,
        severity: 'WARN',
        metadata: { reason: (error as Error).message, client: 'mobile' },
      });
      throw error;
    }
  }
}
