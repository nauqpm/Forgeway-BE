// 📁 src/modules/auth/controllers/user-management.controller.ts
//
// NOTE: Các endpoint quản lý user này hiện đặt tạm trong AuthModule vì lý do tiện lợi.
// Về lâu dài, nên migrate sang UserModule độc lập (chưa thực hiện trong refactor này).

import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  Logger,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { UsersService } from '../../users/services/users.service';
import { UpdateProfileDto } from '../dtos/auth.dto';
import { Request as ExpressRequest } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

interface AuthError extends Error {
  stack?: string;
  message: string;
}

@Controller('auth')
export class UserManagementController {
  private readonly logger = new Logger(UserManagementController.name);

  constructor(
    private readonly userService: UsersService,
  ) {}

  // 📋 Lấy danh sách tất cả người dùng
  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super admin only: list sanitized users' })
  async getAllUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    try {
      const result = await this.userService.getUsersPage(Number(page), Number(limit));
      return {
        data: result.data.map((user) => ({
          id: String(user._id),
          email: user.email,
          role: user.role,
          status: user.status,
          fullName: user.fullName,
          avatar: user.avatar,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
        pagination: result.pagination,
      };
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Lỗi khi lấy danh sách người dùng: ${err.message}`, err.stack);
      throw error;
    }
  }

  // ✏️ Cập nhật thông tin người dùng
  @Put('update')
  @UseGuards(JwtAuthGuard)
  async updateUser(
    @Request() req: RequestWithUser,
    @Body() updateUserDto: UpdateProfileDto,
  ) {
    const userId = req.user.userId;
    try {
      return await this.userService.updateUser(userId, updateUserDto);
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Lỗi khi cập nhật thông tin người dùng: ${err.message}`, err.stack);
      throw error;
    }
  }
}
