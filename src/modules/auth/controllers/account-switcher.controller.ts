import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
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
import { AccountSwitcherService } from '../services/account-switcher.service';
import { SwitchAccountDto } from '../dtos/switch-account.dto';
import { SavedAccountResponseDto } from '../dtos/saved-account.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { setAuthCookies } from '../utils/cookie.utils';
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

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth/accounts')
@UseGuards(JwtAuthGuard)
export class AccountSwitcherController {
  private readonly logger = new Logger(AccountSwitcherController.name);

  constructor(
    private readonly accountSwitcher: AccountSwitcherService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
    return this.accountSwitcher.listSavedAccounts(ownerId);
  }

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Switch the active session to a previously-used account',
    description:
      'Issues a new access/refresh token pair for the target account. ' +
      'The previous session remains valid (multi-account) but the response tokens are ' +
      'for the new active identity. No password re-prompt per product decision.',
  })
  async switch(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: SwitchAccountDto,
  ) {
    const ownerId = req.user.userId;
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ??
      req.ip ??
      undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;
    const ownerRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH] as
      | string
      | undefined;

    try {
      const result = await this.accountSwitcher.switchToAccount(
        ownerId,
        dto.accountId,
        { ip, userAgent, ownerRefreshToken },
      );

      // Rotate cookies to the new identity
      setAuthCookies(res, this.configService, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.LOGIN_SUCCESS,
        severity: 'INFO',
        userId: result.user.id,
        email: result.user.email,
        metadata: { via: 'account-switch', fromUserId: ownerId },
      });

      return {
        success: true,
        message: `Đã chuyển sang account ${result.user.email}`,
        user: result.user,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        severity: 'WARN',
        email: undefined,
        metadata: {
          via: 'account-switch',
          reason: message,
          fromUserId: ownerId,
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
