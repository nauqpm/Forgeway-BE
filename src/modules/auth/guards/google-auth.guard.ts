import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly auditLogService: AuditLogService) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser,
    info: Error | { message?: string } | string | undefined,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest<Request>();
      const reason =
        err?.message ||
        (typeof info === 'string' ? info : info?.message) ||
        'Google OAuth authentication failed';

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.GOOGLE_LOGIN_FAILED,
        severity: 'WARN',
        metadata: {
          stage: 'guard',
          reason,
        },
      });

      throw err || new UnauthorizedException('Google login failed');
    }

    return user;
  }
}
