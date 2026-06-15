import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { COOKIE_NAMES } from '../constants/cookie.constants';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import { TokenService } from '../services/token.service';
import { JwtPayload } from '../types/jwt-payload.type';
import { AUTH_ERROR_CODES } from '@/common/constants/error-codes.constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
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

    const activeToken = await this.tokenService.findActiveAccessToken(token);
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

    request.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    this.logger.log(`Authenticated userId ${decoded.userId}`);
    return true;
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
