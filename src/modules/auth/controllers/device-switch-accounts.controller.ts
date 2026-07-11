import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { DeviceSwitchAccountsService } from '../services/device-switch-accounts.service';
import { DeviceSwitchAccountSwitchDto } from '../dtos/device-switch-account-switch.dto';
import { getDeviceIdFromRequest, setAuthCookies } from '../utils/cookie.utils';

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth/device-switch-accounts')
@UseGuards(JwtAuthGuard)
export class DeviceSwitchAccountsController {
  constructor(
    private readonly deviceSwitchAccountsService: DeviceSwitchAccountsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async list(@Req() req: Request & { user: { userId: string } }) {
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) return [];

    return this.deviceSwitchAccountsService.listForDevice(
      deviceId,
      req.user.userId,
    );
  }

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  async switch(
    @Req() req: Request & { user: { userId: string } },
    @Res({ passthrough: true }) res: Response,
    @Body() dto: DeviceSwitchAccountSwitchDto,
  ) {
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      throw new ConflictException({
        code: 'REQUIRES_FULL_LOGIN',
        targetUserId: dto.targetUserId,
        provider: 'password',
        redirectTo: `/login?intent=switch-renew&targetUserId=${dto.targetUserId}`,
      });
    }

    const result = await this.deviceSwitchAccountsService.switchToDeviceAccount(
      deviceId,
      dto.targetUserId,
      {
        refreshToken: req.cookies?.refresh_token,
        userAgent: req.headers['user-agent'],
      },
    );

    if (!result.success) {
      throw new ConflictException(result);
    }

    setAuthCookies(res, this.configService, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    return {
      success: true,
      redirectTo: result.redirectTo,
      switchedUser: result.switchedUser,
    };
  }

  @Delete(':targetUserId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: Request,
    @Param('targetUserId') targetUserId: string,
  ) {
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) return { success: true };

    await this.deviceSwitchAccountsService.removeForDevice(
      deviceId,
      targetUserId,
    );

    return { success: true };
  }
}
