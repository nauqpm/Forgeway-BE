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
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticationService } from '../services/authentication.service';
import { TokenService } from '../services/token.service';
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
import { AuditLogService } from '../services/audit-log.service';
import { clearAuthCookies, setAuthCookies } from '../utils/cookie.utils';
import { COOKIE_NAMES } from '../constants/cookie.constants';
import { SECURITY_EVENT_TYPES } from '../constants/audit.constants';

// Interface để định nghĩa kiểu dữ liệu của req.user
interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

interface AuthError extends Error {
  stack?: string;
  message: string;
}

// Never put @SkipThrottle() at controller level; it can hide a global auth bypass.
// Keep public auth routes explicitly throttled at method level.
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly tokenService: TokenService,
    private readonly userService: UsersService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Kiểm tra email trước khi submit
  // Public email probes must never reveal whether an account exists.
  // Keep this compatibility endpoint non-disclosing for older clients.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email không được để trống');
    }
    return {
      success: true,
      message: 'Bạn có thể tiếp tục đăng ký.',
    };
  }

  // 📥 Đăng ký người dùng — throttle: 10/min để chống spam account
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: ExpressRequest) {
    this.logger.log('📥 Bắt đầu đăng ký người dùng...');

    try {
      const result = await this.authenticationService.register(registerDto);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REGISTER_SUCCESS,
        severity: 'INFO',
        email: registerDto.email,
      });
      return result;
    } catch (error) {
      const err = error as Error;
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.REGISTER_FAILED,
        severity: 'WARN',
        email: registerDto.email,
        metadata: { reason: err.message },
      });
      throw error;
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authenticationService.verifyRegistrationEmail(dto.email, dto.code);
  }

  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authenticationService.resendRegistrationVerification(dto.email);
  }

  // 🔐 Đăng nhập — throttle: 5/min per IP (brute-force protection)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: ExpressRequest,
  ) {
    this.logger.log('🔐 Đang xử lý đăng nhập...');

    try {
      const result = await this.authenticationService.login(loginDto);

      // ✅ Set cả 2 tokens vào HttpOnly Cookie
      setAuthCookies(res, this.configService, result.tokens);

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
      };
    } catch (error) {
      const err = error as AuthError;
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        severity: 'WARN',
        email: loginDto.email,
        metadata: { reason: err.message },
      });
      throw error;
    }
  }

  // 🚪 Đăng xuất — không cần throttle (guard đã bảo vệ)
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
    const accessTokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const accessToken = accessTokenFromCookie || accessTokenFromHeader;
    const refreshToken = req.cookies?.[COOKIE_NAMES.REFRESH];

    try {
      const result = await this.tokenService.revokeSessionTokens(accessToken, refreshToken);

      clearAuthCookies(res, this.configService);

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.LOGOUT,
        severity: 'INFO',
        userId,
      });

      return result;
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Lỗi khi đăng xuất: ${err.message}`, err.stack);
      throw error;
    }
  }

  // 🔄 Refresh — throttle: 30/min (mobile-friendly, không block concurrent retry)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refreshToken(
    @Req() req: RequestWithUser,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[COOKIE_NAMES.REFRESH] ?? body?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không tồn tại');
    }

    try {
      const result = await this.tokenService.refreshAccessToken(refreshToken);

      setAuthCookies(res, this.configService, { accessToken: result.accessToken, refreshToken: result.refreshToken });

      return { success: true, message: 'Làm mới token thành công' };
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Lỗi khi refresh token: ${err.message}`, err.stack);
      throw error;
    }
  }

  // 👤 Lấy thông tin người dùng
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID không tồn tại trong request');
    }
    try {
      return await this.userService.getUserById(userId);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Lỗi khi lấy thông tin người dùng: ${err.message}`);
      throw error;
    }
  }
}
