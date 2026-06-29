// 📁 src/modules/auth/controllers/auth.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
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
import { AuthenticationService } from '../services/authentication.service';
import { TokenService } from '../services/token.service';
import { AccountSwitcherService } from '../services/account-switcher.service';
import { RecentLoginsService } from '../services/recent-logins.service';
import { UsersService } from '../../users/services/users.service';
import {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from '../dtos/auth.dto';
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
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly tokenService: TokenService,
    private readonly userService: UsersService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    private readonly accountSwitcher: AccountSwitcherService,
    private readonly recentLoginsService: RecentLoginsService,
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
      const result = await this.authenticationService.register(registerDto);
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
      const result = await this.authenticationService.verifyRegistrationEmail(
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
        await this.authenticationService.resendRegistrationVerification(
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
      const result = await this.authenticationService.login(loginDto, {
        ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      });

      setAuthCookies(res, this.configService, result.tokens);

      // Hook: remember this account under any active session owner.
      // If the request carries an existing access token, treat its userId as the owner
      // and remember the freshly-logged-in account. This is what populates the
      // "Switch account" dropdown for users who share a browser.
      const existingAccess = req.cookies?.[COOKIE_NAMES.ACCESS] as
        | string
        | undefined;
      const ownerUserId =
        this.tokenService.peekUserIdFromAccessToken(existingAccess);
      if (ownerUserId && ownerUserId !== result.user.id) {
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
              id: result.user.id,
              email: result.user.email,
              fullName: result.user.fullName,
              avatar: result.user.avatar,
              role: result.user.role,
              ssoProvider:
                result.user.ssoProvider === 'google' ? 'google' : null,
            },
            { ip, userAgent },
          );
        } catch (rememberErr) {
          // Never let rememberAccount break login; just log
          this.logger.warn(
            `rememberAccount failed: ${(rememberErr as Error).message}`,
          );
        }
      }

      // Hook: ghi nhận account này là "gần đây trên thiết bị" — luôn chạy,
      // kể cả khi không có owner cũ (khác với rememberAccount ở trên).
      // Cho phép hiển thị "Tài khoản gần đây" trong dropdown sau khi user logout.
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
            id: result.user.id,
            email: result.user.email,
            fullName: result.user.fullName,
            avatar: result.user.avatar,
            role: result.user.role,
            ssoProvider: result.user.ssoProvider === 'google' ? 'google' : null,
          },
          { ip, userAgent },
        );
      } catch (recentErr) {
        this.logger.warn(
          `recentLogins.remember failed: ${(recentErr as Error).message}`,
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
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const details =
          typeof response === 'object' && response !== null
            ? (response as { details?: { retryAfterSeconds?: unknown } })
                .details
            : undefined;
        const retryAfterSeconds = details?.retryAfterSeconds;
        if (
          error.getStatus() === HttpStatus.TOO_MANY_REQUESTS &&
          typeof retryAfterSeconds === 'number'
        ) {
          res.setHeader('Retry-After', String(retryAfterSeconds));
        }
      }
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      if (error instanceof ServiceUnavailableException) {
        res.set('Retry-After', '30');
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

  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Requires a valid access token via Bearer header or HttpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
    schema: {
      example: {
        id: '...',
        email: 'user@example.com',
        fullName: 'John Doe',
        role: 'user',
        avatar: 'https://...',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in request');
    }
    try {
      return await this.userService.getUserById(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get user profile: ${message}`);
      throw error;
    }
  }
}
