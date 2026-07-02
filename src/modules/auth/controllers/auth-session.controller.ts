import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CredentialLoginService } from '../services/credential-login.service';
import { TokenService } from '../services/token.service';
import { RecentLoginsService } from '../services/recent-logins.service';
import { LoginSessionTrackingService } from '../services/login-session-tracking.service';
import { LoginDto } from '../dtos/auth.dto';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Response, Request as ExpressRequest } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../audit/services/audit-log.service';
import {
  clearAuthCookies,
  getDeviceIdFromRequest,
  setAuthCookies,
  setDeviceIdCookie,
} from '../utils/cookie.utils';
import { COOKIE_NAMES } from '../constants/cookie.constants';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { applyRetryAfterHeader } from '../utils/retry-after.utils';

// Interface để định nghĩa kiểu dữ liệu của req.user
interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

// Never put @SkipThrottle() at controller level; it can hide a global auth bypass.
// Keep public auth routes explicitly throttled at method level.
@ApiTags('Auth')
@Controller('auth')
export class AuthSessionController {
  private readonly logger = new Logger(AuthSessionController.name);

  constructor(
    private readonly credentialLoginService: CredentialLoginService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    private readonly recentLoginsService: RecentLoginsService,
    private readonly loginSessionTrackingService: LoginSessionTrackingService,
  ) {}

  @ApiOperation({
    summary: 'Sign in',
    description:
      'Authenticate with email and password. Tokens are set via HttpOnly cookies. ' +
      'Rate limited to 5 requests per minute per IP.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sign-in successful, tokens set via HttpOnly cookies',
    schema: {
      example: {
        success: true,
        message: 'Sign-in successful.',
        user: {
          id: '...',
          email: 'user@example.com',
          role: 'user',
          fullName: 'John Doe',
          avatar: 'https://...',
          googleId: '...',
          ssoProvider: 'google',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials, account locked, or email not verified',
    schema: {
      example: {
        statusCode: 401,
        message: 'Email or password is incorrect.',
        code: 'INVALID_CREDENTIALS',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Email validation error',
  })
  @ApiResponse({
    status: 429,
    description: 'Progressive login cooldown is active',
    schema: {
      example: {
        statusCode: 429,
        message: 'Please wait before trying again.',
        code: 'LOGIN_RETRY_LATER',
        details: {
          retryAfterSeconds: 4,
          retryAt: '2026-06-24T10:00:04.000Z',
        },
      },
    },
  })
  // Coarse IP safety ceiling. Redis progressive delay handles normal retries.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: ExpressRequest,
  ) {
    this.logger.log('Processing login request...');

    try {
      const result = await this.credentialLoginService.login(loginDto, {
        ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      });

      setAuthCookies(res, this.configService, result.tokens);

      const existingAccess = req.cookies?.[COOKIE_NAMES.ACCESS] as
        | string
        | undefined;
      const trackingResult =
        await this.loginSessionTrackingService.trackLoginSession({
          loggedInUser: {
            id: result.user.id,
            email: result.user.email,
            fullName: result.user.fullName,
            avatar: result.user.avatar,
            role: result.user.role,
            ssoProvider: result.user.ssoProvider === 'google' ? 'google' : null,
          },
          existingAccessToken: existingAccess,
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
        type: SECURITY_EVENT_TYPES.LOGIN_SUCCESS,
        severity: 'INFO',
        email: loginDto.email,
        metadata: { role: result.user.role },
      });

      return {
        success: result.success,
        message: result.message,
        user: result.user,
        tokens: result.tokens, // <--- Added for Mobile apps
      };
    } catch (error) {
      applyRetryAfterHeader(error, res);
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        severity: 'WARN',
        email: loginDto.email,
        metadata: { reason: message },
      });
      throw error;
    }
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Sign out' })
  @ApiResponse({
    status: 200,
    description: 'Sign-out successful, cookies cleared and tokens revoked',
    schema: {
      example: {
        success: true,
        message: 'Sign-out successful.',
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.userId;

    const accessTokenFromCookie = req.cookies?.[COOKIE_NAMES.ACCESS];
    const authHeader = req.headers.authorization;
    const accessTokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : undefined;
    const accessToken = accessTokenFromCookie || accessTokenFromHeader;
    const refreshToken = req.cookies?.[COOKIE_NAMES.REFRESH];

    try {
      const result = await this.tokenService.revokeSessionTokens(
        accessToken,
        refreshToken,
      );

      const deviceId = getDeviceIdFromRequest(req);
      if (deviceId) {
        await this.recentLoginsService
          .clearForDevice(deviceId)
          .catch((err: Error) =>
            this.logger.warn(
              `Non-fatal: could not clear recent logins on logout — ${err.message}`,
            ),
          );
      }

      clearAuthCookies(res, this.configService);

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.LOGOUT,
        severity: 'INFO',
        userId,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Logout failed: ${message}`, stack);
      throw error;
    }
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Use refresh token from HttpOnly cookie or request body to obtain a new access token. ' +
      'New tokens are set back to cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      example: {
        success: true,
        message: 'Token refreshed successfully.',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or revoked refresh token',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refreshToken(
    @Req() req: RequestWithUser,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      req.cookies?.[COOKIE_NAMES.REFRESH] ?? body?.refreshToken;

    if (!refreshToken) {
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REFRESH_FAILED,
        severity: 'WARN',
        metadata: { reason: 'Refresh token missing' },
      });
      throw new UnauthorizedException('Refresh token not found');
    }

    try {
      const result = await this.tokenService.refreshAccessToken(refreshToken);

      setAuthCookies(res, this.configService, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REFRESH_SUCCESS,
        severity: 'INFO',
      });

      return {
        success: true,
        message: 'Token refreshed successfully.',
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      };
    } catch (error) {
      applyRetryAfterHeader(error, res);
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      if (error instanceof ServiceUnavailableException) {
        this.logger.warn('Refresh token failed: database unavailable');
        throw error;
      }
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REFRESH_FAILED,
        severity: 'WARN',
        metadata: { reason: message },
      });
      this.logger.error(`Refresh token failed: ${message}`, stack);
      throw error;
    }
  }
}
