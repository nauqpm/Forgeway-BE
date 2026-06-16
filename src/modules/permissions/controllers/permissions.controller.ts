import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PermissionsService } from '../services/permissions.service';
import { CreatePermissionDto } from '../dtos/create-permission.dto';
import { UpdateUserPermissionsDto } from '../dtos/update-user-permissions.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PermissionGuard } from '../guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/permission.decorator';
import { UserPermissionDocument } from '../schemas/user-permission.schema';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

@Controller('permissionsapi')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @RequirePermission('permissions', 'read')
  async findAll() {
    const permissions = await this.permissionsService.findAll();
    return {
      success: true,
      permissions: permissions.map(p => ({
        id: (p as any).id || (p as any)._id.toString(),
        resource: p.resource,
        action: p.action,
      })),
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @RequirePermission('permissions', 'create')
  async create(@Body() createPermissionDto: CreatePermissionDto) {
    const permission =
      await this.permissionsService.create(createPermissionDto);
    return {
      success: true,
      permission: {
        id: (permission as any).id || (permission as any)._id.toString(),
        resource: permission.resource,
        action: permission.action,
      },
    };
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @RequirePermission('permissions', 'read')
  async getUserPermissions(@Param('userId') userId: string) {
    const permissions =
      await this.permissionsService.getUserPermissions(userId);
    return {
      success: true,
      permissions: permissions.map(p => ({
        id: p._id.toString(),
        resource: p.resource,
        action: p.action,
        source: p.source,
      })),
    };
  }

  @Put('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @RequirePermission('permissions', 'update')
  async updateUserPermissions(
    @Param('userId') userId: string,
    @Body() updateDto: UpdateUserPermissionsDto,
  ) {
    try {
      // Validate input
      if (!userId || !updateDto.permissionIds) {
        throw new Error('Invalid input: userId and permissionIds are required');
      }

      // Ensure permissionIds is an array
      if (!Array.isArray(updateDto.permissionIds)) {
        throw new Error('Invalid input: permissionIds must be an array');
      }

      // Ensure userId in DTO matches URL parameter
      const updatedPermissions =
        await this.permissionsService.updateUserPermissions({
          userId: userId, // Use userId from URL parameter
          permissionIds: updateDto.permissionIds,
        });

      return {
        success: true,
        message: 'User permissions updated successfully',
        permissions: updatedPermissions.map((p: UserPermissionDocument) => {
          const permissionDoc = p.toObject();
          return {
            id: permissionDoc._id.toString(),
            userId: permissionDoc.userId.toString(),
            permissionId:
              permissionDoc.permissionId &&
              typeof permissionDoc.permissionId === 'object'
                ? {
                    id: permissionDoc.permissionId._id.toString(),
                    resource: permissionDoc.permissionId.resource,
                    action: permissionDoc.permissionId.action,
                  }
                : permissionDoc.permissionId.toString(),
          };
        }),
      };
    } catch (error) {
      const err = error as Error;
      console.error('Error updating user permissions:', error);
      // Return a more descriptive error response
      return {
        success: false,
        message: err.message || 'Failed to update user permissions',
        error: err.message,
      };
    }
  }

  @Post('initialize')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @RequirePermission('permissions', 'create')
  async initializeDefaultPermissions() {
    await this.permissionsService.initializeDefaultPermissions();
    return {
      success: true,
      message: 'Default permissions initialized successfully',
    };
  }

  @Post('super-admin/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @RequirePermission('permissions', 'update')
  async assignAllPermissionsToSuperAdmin(@Param('userId') userId: string) {
    try {
      // First, ensure all permissions are initialized
      await this.permissionsService.initializeDefaultPermissions();

      // Get all permissions and assign them to the user
      const allPermissions = await this.permissionsService.findAll();
      const permissionIds = allPermissions.map(p => (p as any)._id.toString());

      return await this.permissionsService.updateUserPermissions({
        userId,
        permissionIds,
      });
    } catch (error) {
      console.error('Error assigning super admin permissions:', error);
      throw error;
    }
  }
}
