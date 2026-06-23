import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';

const GOOGLE_OAUTH_AUTHORIZE_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = ['email', 'profile'] as const;

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  // async canActivate(context: ExecutionContext) {
  //   const req = context.switchToHttp().getRequest<Request>();
  //   this.logGoogleOAuthRequest(req);

  //   return (await super.canActivate(context)) as boolean;
  // }

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

  // private logGoogleOAuthRequest(req: Request): void {
  //   const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
  //   const callbackUrl =
  //     this.configService.get<string>('GOOGLE_REDIRECT_URL') || '';
  //   const generatedOAuthUrl = this.buildGoogleOAuthUrl(clientId, callbackUrl);

  //   // Temporary investigation logs. Remove after redirect_uri_mismatch is resolved.
  //   console.log('================ GOOGLE LOGIN START ================');
  //   console.log('Origin:', req.headers.origin);
  //   console.log('Host:', req.headers.host);
  //   console.log('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
  //   console.log('X-Forwarded-Host:', req.headers['x-forwarded-host']);
  //   console.log('GOOGLE_CLIENT_ID USED:', clientId);
  //   console.log('GOOGLE_REDIRECT_URL ENV:', process.env.GOOGLE_REDIRECT_URL);
  //   console.log('GOOGLE_CALLBACK_URL USED:', callbackUrl);
  //   console.log('GOOGLE_SCOPE USED:', GOOGLE_OAUTH_SCOPE.join(' '));
  //   console.log('GOOGLE_GENERATED_REDIRECT_URI:', callbackUrl);
  //   console.log('GOOGLE_GENERATED_OAUTH_URL:', generatedOAuthUrl);
  //   console.log('===================================================');
  // }

  private buildGoogleOAuthUrl(clientId: string, callbackUrl: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: GOOGLE_OAUTH_SCOPE.join(' '),
    });

    return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  }
}
