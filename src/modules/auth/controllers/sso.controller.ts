import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SsoLoginService } from '../services/sso-login.service';
import { IsNotEmpty, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import { UsersService } from '@/modules/users/services/users.service';
import { AuditLogService } from '@/modules/audit/services/audit-log.service';
import { SECURITY_EVENT_TYPES } from '@/modules/audit/constants/audit.constants';

export class SsoTokenDto {
  @IsNotEmpty()
  @IsString()
  code!: string;
}

export class GetExchangeCodeBody {
  @IsNotEmpty()
  @IsString()
  redirectUrl!: string;
}

@ApiTags('SSO')
@Controller('auth/sso')
export class SsoController {
  constructor(
    private readonly ssoLoginService: SsoLoginService,
    private readonly userService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @ApiOperation({
    summary: 'Exchange SSO Authorization Code for ID Token',
    description:
      'Validates the authorization code and returns an ID token containing the user profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'Code successfully exchanged for an ID token.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('token')
  async exchangeToken(@Body() dto: SsoTokenDto) {
    const idToken = await this.ssoLoginService.exchangeCodeForToken(dto.code);
    return {
      success: true,
      idToken: idToken,
    };
  }

  // get exchange code (not token) when already loged in
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get SSO exchange code (already authenticated)',
    description:
      'For a user who already holds a valid access token, issue a short-lived ' +
      'authorization code that can be exchanged for a fresh access token at the redirect target.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization code generated, redirect URL returned',
    schema: {
      example: {
        success: true,
        redirectUrl: 'https://app.example.com/callback?code=...',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiBadRequestResponse({ description: 'Invalid or disallowed redirect URL' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('code')
  @UseGuards(JwtAuthGuard)
  async getExchangeCode(
    @Request() req: RequestWithUser,
    @Body() body: GetExchangeCodeBody,
  ) {
    const { redirectUrl } = body;
    const user = await this.userService.getUserById(req.user!.userId);
    const code = await this.ssoLoginService.generateAuthorizationCode(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        avatar: user.avatar,
      },
      redirectUrl,
    );

    const callbackUrl = new URL(redirectUrl);
    callbackUrl.searchParams.set('code', code);

    this.auditLogService.logRequest(req, {
      type: SECURITY_EVENT_TYPES.LOGIN_SUCCESS, // hoặc thêm 1 SSO_CODE_ISSUED riêng
      severity: 'INFO',
      userId: req.user!.userId,
    });

    return {
      success: true,
      redirectUrl: callbackUrl.toString(),
    };
  }
}
