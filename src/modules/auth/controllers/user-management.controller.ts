// 📁 src/modules/auth/controllers/user-management.controller.ts
//
// NOTE: These user management endpoints are currently placed in AuthModule for convenience.
// In the long term, they should be migrated to an independent UserModule.

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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';

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

  constructor(private readonly userService: UsersService) {}

  // 📋 List all users
  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super admin only: list sanitized users' })
  @ApiResponse({
    status: 200,
    description: 'List of users (paginated)',
    schema: {
      example: {
        data: [
          {
            id: '...',
            email: 'user@example.com',
            role: 'user',
            status: 'active',
            fullName: 'John Doe',
            avatar: 'https://...',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
      },
    },
  })
  async getAllUsers(@Query('page') page = '1', @Query('limit') limit = '20') {
    try {
      const result = await this.userService.getUsersPage(
        Number(page),
        Number(limit),
      );
      return {
        data: result.data.map(user => ({
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
      this.logger.error(`❌ Error fetching users: ${err.message}`, err.stack);
      throw error;
    }
  }

  // ✏️ Update user information
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    schema: {
      example: {
        _id: '...',
        email: 'user@example.com',
        fullName: 'John Doe',
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
      this.logger.error(`❌ Error updating user: ${err.message}`, err.stack);
      throw error;
    }
  }

  // 🔑 Super admin: Update user role
  @Put('users/:userId/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super admin: Update user role' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    try {
      const validRoles = ['user', 'super_admin'];
      if (!validRoles.includes(body.role)) {
        throw new BadRequestException(
          `Role must be one of: ${validRoles.join(', ')}`,
        );
      }
      return await this.userService.updateUserRole(userId, body.role);
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Error updating role: ${err.message}`, err.stack);
      throw error;
    }
  }

  // 🔑 Super admin: Update user status
  @Put('users/:userId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super admin: Update user status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body() body: { status: string },
  ) {
    try {
      const validStatuses = [
        'active',
        'inactive',
        'pending_verification',
        'suspended',
      ];
      if (!validStatuses.includes(body.status)) {
        throw new BadRequestException(
          `Status must be one of: ${validStatuses.join(', ')}`,
        );
      }
      return await this.userService.updateUserStatus(userId, body.status);
    } catch (error) {
      const err = error as AuthError;
      this.logger.error(`❌ Error updating status: ${err.message}`, err.stack);
      throw error;
    }
  }
}
