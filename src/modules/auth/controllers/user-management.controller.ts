// 📁 src/modules/auth/controllers/user-management.controller.ts
//
// NOTE: Các endpoint quản lý user này hiện đặt tạm trong AuthModule vì lý do tiện lợi.
// Về lâu dài, nên migrate sang UserModule độc lập (chưa thực hiện trong refactor này).

import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { UsersService } from '../../users/services/users.service';
import { UpdateProfileDto } from '../dtos/auth.dto';
import { Request as ExpressRequest } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';

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

@ApiTags('Auth - User Management')
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
  @ApiResponse({
    status: 200,
    description: 'Danh sách người dùng (phân trang)',
    schema: {
      example: {
        data: [
          {
            id: '...',
            email: 'user@example.com',
            role: 'user',
            status: 'active',
            fullName: 'Nguyễn Văn A',
            avatar: 'https://...',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
      },
    },
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cập nhật thông tin người dùng hiện tại' })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật thông tin thành công',
    schema: {
      example: {
        _id: '...',
        email: 'user@example.com',
        fullName: 'Nguyễn Văn A',
        avatar: 'https://...',
      },
    },
  })
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

  // 🔑 Super admin: Cập nhật role của user
  @Put('users/:userId/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super admin: Cập nhật role của user' })
  @ApiResponse({ status: 200, description: 'Cập nhật role thành công' })
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    try {
      const validRoles = ['user', 'super_admin'];
      if (!validRoles.includes(body.role)) {
        throw new BadRequestException(`Role phải là một trong: ${validRoles.join(', ')}`);
      }
      return await this.userService.updateUserRole(userId, body.role);
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Lỗi khi cập nhật role: ${err.message}`, err.stack);
      throw error;
    }
  }

  // 🔑 Super admin: Cập nhật status của user
  @Put('users/:userId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super admin: Cập nhật status của user' })
  @ApiResponse({ status: 200, description: 'Cập nhật status thành công' })
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body() body: { status: string },
  ) {
    try {
      const validStatuses = ['active', 'inactive', 'pending_verification', 'suspended'];
      if (!validStatuses.includes(body.status)) {
        throw new BadRequestException(`Status phải là một trong: ${validStatuses.join(', ')}`);
      }
      return await this.userService.updateUserStatus(userId, body.status);
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Lỗi khi cập nhật status: ${err.message}`, err.stack);
      throw error;
    }
  }
}
