import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { IsMongoId } from 'class-validator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RecentLoginsService } from '../services/recent-logins.service';
import { getDeviceIdFromRequest } from '../utils/cookie.utils';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

/**
 * DTO đơn giản — dùng class-validator thay vì tạo file DTO riêng để giữ footprint nhỏ.
 * Path param đã được validate bởi ValidationPipe toàn cục khi controller-bound.
 */
class AccountIdParam {
  @IsMongoId()
  accountId!: string;
}

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth/accounts/recent')
@UseGuards(JwtAuthGuard)
export class RecentLoginsController {
  private readonly logger = new Logger(RecentLoginsController.name);

  constructor(private readonly recentLogins: RecentLoginsService) {}

  @Get()
  @ApiOperation({
    summary: 'List accounts recently used on this device',
    description:
      'Returns up to 10 accounts the current device has logged into. ' +
      'Filtered by the device_id HttpOnly cookie, not by the current user — ' +
      'so an account A can see account B that was previously signed in on the same browser.',
  })
  @ApiResponse({ status: 200, description: 'List of recent accounts' })
  async list(@Req() req: RequestWithUser) {
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      // Chưa từng login trên device này → trả rỗng (không lỗi)
      return [];
    }
    return this.recentLogins.listForDevice(deviceId);
  }

  @Delete(':accountId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Remove an account from the device's recent logins list",
  })
  async forget(@Req() req: RequestWithUser, @Param() params: AccountIdParam) {
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      // Không có deviceId thì không có gì để xoá
      return {
        success: true,
        message: 'Không có danh sách gần đây trên thiết bị này.',
      };
    }
    if (!params.accountId) {
      throw new BadRequestException('accountId không hợp lệ');
    }
    await this.recentLogins.forgetForDevice(deviceId, params.accountId);
    return {
      success: true,
      message: 'Đã xoá account khỏi danh sách gần đây trên thiết bị này.',
    };
  }
}
