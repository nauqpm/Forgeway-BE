import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Permission, PermissionDocument } from '../schemas/permission.schema';
import { UserPermission, UserPermissionDocument } from '../schemas/user-permission.schema';
import { CreatePermissionDto } from '../dtos/create-permission.dto';
import { UpdateUserPermissionsDto } from '../dtos/update-user-permissions.dto';

export interface PermissionWithSource {
  _id: Types.ObjectId;
  source: 'direct' | 'role';
  resource: string;
  action: string;
}

interface PopulatedPermission {
  _id: Types.ObjectId;
  resource: string;
  action: string;
}

interface PopulatedUserPermission {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  permissionId: PopulatedPermission;
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(Permission.name) private permissionModel: Model<PermissionDocument>,
    @InjectModel(UserPermission.name) private userPermissionModel: Model<UserPermissionDocument>,
  ) { }

  async findAll(): Promise<PermissionDocument[]> {
    return this.permissionModel.find().exec();
  }

  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    const createdPermission = new this.permissionModel(createPermissionDto);
    return createdPermission.save();
  }

  async getUserPermissions(userId: string): Promise<PermissionWithSource[]> {
    try {
      const objectId = new Types.ObjectId(userId);
      console.log('Getting permissions for userId:', objectId.toString());

      // Get user's direct permissions
      const userPermissions = await this.userPermissionModel
        .find({ userId: objectId })
        .populate<{ permissionId: PopulatedPermission }>('permissionId')
        .lean<PopulatedUserPermission[]>()
        .exec();

      const allPermissions: PermissionWithSource[] = userPermissions.map(up => ({
        _id: up.permissionId._id,
        resource: up.permissionId.resource,
        action: up.permissionId.action,
        source: 'direct' as const
      }));

      console.log('Combined permissions:', allPermissions);
      return allPermissions;
    } catch (error) {
      console.error('Error getting user permissions:', error);
      throw error;
    }
  }

  async checkUserPermission(userId: string, resource: string, action: string): Promise<boolean> {
    try {
      const allPermissions = await this.getUserPermissions(userId);

      // Check if any permission matches the required resource and action
      const hasPermission = allPermissions.some(permission =>
        permission.resource === resource && permission.action === action
      );

      console.log(`Checking permission for ${resource}:${action} - Result: ${hasPermission}`);
      return hasPermission;
    } catch (error) {
      console.error('Error checking user permission:', error);
      return false;
    }
  }

  async updateUserPermissions(updateDto: UpdateUserPermissionsDto): Promise<UserPermissionDocument[]> {
    try {
      if (!updateDto.userId || !Array.isArray(updateDto.permissionIds)) {
        throw new Error('Invalid input: userId is required and permissionIds must be an array');
      }

      const userId = new Types.ObjectId(updateDto.userId);
      const permissionIds = updateDto.permissionIds.map(id => {
        try {
          return new Types.ObjectId(id);
        } catch (error) {
          throw new Error(`Invalid permission ID format: ${id}`);
        }
      });

      console.log('Updating permissions for user:', userId.toString());
      console.log('New permission IDs:', permissionIds.map(id => id.toString()));

      // Validate that all permission IDs exist
      const existingPermissions = await this.permissionModel.find({
        _id: { $in: permissionIds }
      }).exec();

      if (existingPermissions.length !== permissionIds.length) {
        throw new Error('Some permission IDs do not exist');
      }

      // Delete all existing permissions for the user
      await this.userPermissionModel.deleteMany({ userId });

      if (permissionIds.length > 0) {
        // Create new permissions
        const userPermissions = permissionIds.map(permissionId => ({
          userId,
          permissionId,
        }));

        // Insert new permissions
        await this.userPermissionModel.insertMany(userPermissions);
      }

      // Return updated permissions with populated data
      const updatedPermissions = await this.userPermissionModel
        .find({ userId })
        .populate('permissionId')
        .exec();

      console.log('Updated permissions:', updatedPermissions);
      return updatedPermissions;
    } catch (error) {
      const err = error as Error;
      console.error('Error updating user permissions:', error);
      if (err.message.includes('Invalid input') || err.message.includes('Invalid permission ID format')) {
        throw new Error(`Bad Request: ${err.message}`);
      }
      throw error;
    }
  }

  async initializeDefaultPermissions(): Promise<void> {
    const defaultPermissions = [
      { resource: 'categories-posts', action: 'create' },
      { resource: 'categories-posts', action: 'read' },
      { resource: 'categories-posts', action: 'update' },
      { resource: 'categories-posts', action: 'delete' },

      { resource: 'posts', action: 'create' },
      { resource: 'posts', action: 'read' },
      { resource: 'posts', action: 'update' },
      { resource: 'posts', action: 'delete' },
      { resource: 'posts', action: 'approve' },
      { resource: 'posts', action: 'publish' },

      // Images Permissions
      { resource: 'images', action: 'create' },
      { resource: 'images', action: 'read' },
      { resource: 'images', action: 'delete' },

      // Permissions for Permissions Management
      { resource: 'permissions', action: 'create' },
      { resource: 'permissions', action: 'read' },
      { resource: 'permissions', action: 'update' },
      { resource: 'permissions', action: 'delete' },

      // Property Posts Permissions
      { resource: 'property-posts', action: 'create' },
      { resource: 'property-posts', action: 'read' },
      { resource: 'property-posts', action: 'update' },
      { resource: 'property-posts', action: 'delete' },
      { resource: 'property-posts', action: 'approve' },
      { resource: 'property-posts', action: 'highlight' },

      // Amenities Permissions
      { resource: 'amenities', action: 'create' },
      { resource: 'amenities', action: 'read' },
      { resource: 'amenities', action: 'update' },
      { resource: 'amenities', action: 'delete' },
    ];

    for (const permission of defaultPermissions) {
      const exists = await this.permissionModel.findOne(permission);
      if (!exists) {
        await this.create(permission);
      }
    }
  }
}
