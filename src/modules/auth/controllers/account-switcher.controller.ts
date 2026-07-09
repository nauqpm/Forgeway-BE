import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { AccountSwitcherService } from '../services/account-switcher.service';
import { AccountSwitchSsoService } from '../services/account-switch-sso.service';
import {
  isValidSwitchCredentialShape,
  SwitchAccountDto,
} from '../dtos/switch-account.dto';
import { SavedAccountResponseDto } from '../dtos/saved-account.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { getDeviceIdFromRequest, setAuthCookies } from '../utils/cookie.utils';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { COOKIE_NAMES } from '../constants/cookie.constants';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

class InitAccountSwitchSsoDto {
  @IsMongoId()
  targetAccountId: string;

  @IsOptional()
  @IsString()
  currentPageUrl?: string;
}

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth/accounts')
@UseGuards(JwtAuthGuard)
export class AccountSwitcherController {
  private readonly logger = new Logger(AccountSwitcherController.name);

  constructor(
    private readonly accountSwitcher: AccountSwitcherService,
    private readonly accountSwitchSso: AccountSwitchSsoService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private isAccountSwitcherEnabled() {
    return this.configService.get<string>('ACCOUNT_SWITCHER_ENABLED') === 'true';
  }

  private getRequestMetadata(req: RequestWithUser, toUserId?: string) {
    const ownerId = req.user.userId;
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ??
      req.ip ??
      undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;
    const deviceId = getDeviceIdFromRequest(req, this.configService) ?? undefined;

    return {
      triggeredVia: 'account-switch',
      actorUserId: ownerId,
      fromUserId: ownerId,
      toUserId,
      deviceId,
      ip,
      userAgent,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List accounts the current user has previously logged in as',
    description:
      'Returns saved accounts shown in the "Switch account" dropdown. ' +
      'Only entries created by the current owner are returned.',
  })
  @ApiResponse({ status: 200, type: [SavedAccountResponseDto] })
  async list(@Req() req: RequestWithUser) {
    const ownerId = req.user.userId;
    return this.accountSwitcher.listSavedAccounts(
      ownerId,
      getDeviceIdFromRequest(req, this.configService) ?? undefined,
    );
  }

  @Post('switch/sso/init')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Start an SSO-backed account switch',
  })
  async initSsoSwitch(
    @Req() req: RequestWithUser,
    @Body() dto: InitAccountSwitchSsoDto,
  ) {
    if (!this.isAccountSwitcherEnabled()) {
      throw new ServiceUnavailableException({
        code: 'FEATURE_DISABLED',
        message: 'FEATURE_DISABLED',
      });
    }

    return this.accountSwitchSso.initSwitch(req.user.userId, dto.targetAccountId, {
      deviceId: getDeviceIdFromRequest(req, this.configService) ?? undefined,
      currentPageUrl: dto.currentPageUrl,
    });
  }

  @Get('switch/sso/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Complete an SSO-backed account switch',
  })
  async completeSsoSwitch(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('state') state: string,
    @Query('code') code: string,
    @Query('prompt') prompt?: string,
  ) {
    if (prompt === 'none') {
      throw new BadRequestException('Silent SSO switch is not allowed');
    }

    try {
      const result = await this.accountSwitchSso.completeSwitch(state, code, {
        deviceId: getDeviceIdFromRequest(req, this.configService) ?? undefined,
      });

      setAuthCookies(res, this.configService, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.ACCOUNT_SWITCH_SUCCESS,
        severity: 'INFO',
        userId: result.targetAccountId,
        email: result.user.email,
        metadata: {
          ...this.getRequestMetadata(req, result.targetAccountId),
          reauthMethod: 'sso',
          outcome: 'success',
          reason: 'SWITCH_COMPLETED',
        },
      });

      return res.redirect(result.currentPageUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.ACCOUNT_SWITCH_FAILED,
        severity: 'WARN',
        metadata: {
          ...this.getRequestMetadata(req),
          reauthMethod: 'sso',
          outcome: 'failed',
          reason: message,
        },
      });
      throw error;
    }
  }

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Switch the active session to a previously-used account',
    description:
      'Issues a new access/refresh token pair for the target account. ' +
      'The request must prove access to the target account, or use a valid server-side parked session.',
  })
  async switch(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: SwitchAccountDto,
  ) {
    const ownerId = req.user.userId;
    const ownerRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH] as
      | string
      | undefined;
    const baseAuditMetadata = this.getRequestMetadata(req, dto.accountId);
    const reauthMethod = dto.credential?.type;

    try {
      if (!this.isAccountSwitcherEnabled()) {
        throw new ServiceUnavailableException({
          code: 'FEATURE_DISABLED',
          message: 'FEATURE_DISABLED',
        });
      }

      if (!isValidSwitchCredentialShape(dto.credential)) {
        throw new BadRequestException(
          'Credential must include exactly one field matching credential.type',
        );
      }

      const result = await this.accountSwitcher.switchToAccount(
        ownerId,
        dto.accountId,
        dto.credential,
        {
          ip: baseAuditMetadata.ip,
          userAgent: baseAuditMetadata.userAgent,
          ownerRefreshToken,
          deviceId: baseAuditMetadata.deviceId,
        },
      );

      // Rotate cookies to the new identity
      setAuthCookies(res, this.configService, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.ACCOUNT_SWITCH_SUCCESS,
        severity: 'INFO',
        userId: result.user.id,
        email: result.user.email,
        metadata: {
          ...baseAuditMetadata,
          toUserId: result.user.id,
          reauthMethod,
          outcome: 'success',
          reason: 'SWITCH_COMPLETED',
        },
      });

      return {
        success: true,
        message: `Đã chuyển sang account ${result.user.email}`,
        user: result.user,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const disabled = error instanceof ServiceUnavailableException;
      this.auditLogService.logRequest(req, {
        type: disabled
          ? SECURITY_EVENT_TYPES.ACCOUNT_SWITCH_DISABLED
          : SECURITY_EVENT_TYPES.ACCOUNT_SWITCH_FAILED,
        severity: 'WARN',
        email: undefined,
        metadata: {
          ...baseAuditMetadata,
          ...(disabled ? {} : { reauthMethod }),
          outcome: disabled ? 'disabled' : 'failed',
          reason: message,
        },
      });
      throw error;
    }
  }

  @Delete(':accountId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Remove a saved account from the current user's switcher list",
  })
  async forget(
    @Req() req: RequestWithUser,
    @Param('accountId') accountId: string,
  ) {
    const ownerId = req.user.userId;
    await this.accountSwitcher.forgetAccount(ownerId, accountId);
    return {
      success: true,
      message: 'Đã xoá account khỏi danh sách chuyển đổi.',
    };
  }
}
