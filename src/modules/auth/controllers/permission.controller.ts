// 📁 src/modules/auth/controllers/permission.controller.ts

import {
  Controller,
  Get,
  UseGuards,
  Request,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsService } from '../../permissions/services/permissions.service';
import { Request as ExpressRequest } from 'express';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('auth')
export class PermissionController {
  private readonly logger = new Logger(PermissionController.name);

  constructor(
    private readonly permissionsService: PermissionsService,
  ) {}

  // 🔒 Lấy quyền của người dùng đã đăng nhập
  @Get('my-permissions')
  @UseGuards(JwtAuthGuard)
  async getMyPermissions(@Request() req: RequestWithUser) {
    const userId = req.user?.userId;
    const role = req.user?.role;

    try {
      if (role === GLOBAL_ROLES.SUPER_ADMIN) {
        const allPermissions = await this.permissionsService.findAll();
        return {
          role: GLOBAL_ROLES.SUPER_ADMIN,
          permissions: allPermissions.map(p => ({
            id: String(p._id),
            resource: p.resource,
            action: p.action,
          })),
          isAdmin: true,
        };
      }

      const userPermissions = await this.permissionsService.getUserPermissions(userId);
      return {
        role,
        permissions: userPermissions.map(permission => ({
          id: permission._id.toString(),
          resource: permission.resource,
          action: permission.action,
          source: permission.source,
        })),
        isAdmin: false,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Lỗi khi lấy quyền người dùng: ${err.message}`, err.stack);
      throw error;
    }
  }

  @Get('check-permission')
  @UseGuards(JwtAuthGuard)
  async checkPermission(@Request() req) {
    try {
      const userId = req.user.userId;
      const userPermissions = await this.permissionsService.getUserPermissions(userId);
      return {
        success: true,
        permissions: userPermissions.map(up => ({
          resource: up.resource,
          action: up.action,
          source: up.source,
        })),
      };
    } catch (error) {
      throw new UnauthorizedException('Error checking permissions');
    }
  }
}
