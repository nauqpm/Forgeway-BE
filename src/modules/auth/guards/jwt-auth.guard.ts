import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { COOKIE_NAMES } from '../constants/cookie.constants';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import { TokenLookupService } from '../services/token-lookup.service';
import { JwtPayload } from '../types/jwt-payload.type';
import { AUTH_ERROR_CODES } from '@/common/constants/error-codes.constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private static readonly passwordChangeAllowedRoutes = new Set([
    'GET /auth/me',
    'GET /users/me',
    'PUT /users/me',
    'POST /auth/logout',
  ]);

  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenLookupService: TokenLookupService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    let token: string | undefined = request.cookies?.[COOKIE_NAMES.ACCESS];
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      this.logger.warn('Access token missing or malformed');
      this.logUnauthorized(request, 'Access token missing');
      throw new UnauthorizedException('Token không hợp lệ hoặc thiếu');
    }

    let decoded: JwtPayload;
    try {
      decoded = this.jwtService.verify<JwtPayload>(token);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError') {
          this.logger.warn('Access token expired');
          this.logUnauthorized(request, AUTH_ERROR_CODES.TOKEN_EXPIRED);
          throw new UnauthorizedException({
            statusCode: 401,
            error: AUTH_ERROR_CODES.TOKEN_EXPIRED,
            message: 'Access token đã hết hạn, vui lòng gọi /auth/refresh',
          });
        }

        this.logger.error(`Invalid access token: ${error.message}`);
      }

      this.logUnauthorized(request, 'Invalid access token');
      throw new UnauthorizedException('Token không hợp lệ');
    }

    if (decoded.type && decoded.type !== 'access') {
      this.logger.warn(`Wrong token type: ${decoded.type}`);
      this.logUnauthorized(request, 'Wrong token type', decoded.userId);
      throw new UnauthorizedException(
        'Chỉ sử dụng access token cho endpoint này',
      );
    }

    const activeToken =
      await this.tokenLookupService.findActiveAccessToken(token);
    if (!activeToken) {
      this.logger.warn(
        `Access token revoked or not found: userId ${decoded.userId}`,
      );
      this.logUnauthorized(
        request,
        AUTH_ERROR_CODES.TOKEN_REVOKED,
        decoded.userId,
      );
      throw new UnauthorizedException({
        statusCode: 401,
        error: AUTH_ERROR_CODES.TOKEN_REVOKED,
        message: 'Token đã bị thu hồi hoặc không còn hợp lệ',
      });
    }

    if (activeToken.userId.toString() !== decoded.userId) {
      this.logger.warn(`Token user mismatch: ${decoded.userId}`);
      this.logUnauthorized(request, 'Token user mismatch', decoded.userId);
      throw new UnauthorizedException('Token không hợp lệ');
    }

    if (
      decoded.mustChangePassword &&
      !this.isPasswordChangeAllowed(
        request.method,
        request.originalUrl || request.url,
      )
    ) {
      this.logger.warn(
        `Blocked access for userId ${decoded.userId} until password is changed`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        message: 'Password change required before accessing this resource',
      });
    }

    request.user = {
      userId: decoded.userId,
      rootUserId: decoded.rootUserId,
      email: decoded.email,
      role: decoded.role,
      mustChangePassword: decoded.mustChangePassword,
    };

    this.logger.log(`Authenticated userId ${decoded.userId}`);
    return true;
  }

  private isPasswordChangeAllowed(
    method: string,
    requestPath: string,
  ): boolean {
    const normalizedPath = requestPath
      .split('?')[0]
      .replace(/\/+$/, '')
      .toLowerCase();

    if (method.toUpperCase() === 'POST' && normalizedPath === '/auth/refresh') {
      return true;
    }

    return JwtAuthGuard.passwordChangeAllowedRoutes.has(
      `${method.toUpperCase()} ${normalizedPath}`,
    );
  }

  private logUnauthorized(
    request: RequestWithUser,
    reason: string,
    userId?: string,
  ): void {
    this.auditLogService.logRequest(request, {
      type: SECURITY_EVENT_TYPES.UNAUTHORIZED_ACCESS,
      severity: 'WARN',
      userId,
      metadata: {
        reason,
        path: request.originalUrl || request.url,
        method: request.method,
      },
    });
  }
}
