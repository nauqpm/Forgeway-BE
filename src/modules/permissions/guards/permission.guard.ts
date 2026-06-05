import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../services/permissions.service';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { Auth } from '../../auth/schemas/auth.schema';
import { getModelToken } from '@nestjs/mongoose';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
    private jwtService: JwtService,
    @Inject(getModelToken(Auth.name)) private authModel: Model<Auth>,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get permission requirements from metadata
    const permissionMeta = this.reflector.get('permission', context.getHandler());

    if (!permissionMeta) {
      return true; // No permission requirements
    }

    const { resource, action } = permissionMeta;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId || request.user?.id;

    if (!userId) {
      this.logger.debug('[PermissionGuard] No user ID found in request');
      this.logger.debug('[PermissionGuard] User object:', JSON.stringify(request.user));
      return false;
    }

    if (request.user?.role === GLOBAL_ROLES.SUPER_ADMIN) {
      this.logger.debug('[PermissionGuard] User has super_admin role, access granted');
      return true;
    }

    // Check both direct and role-based permissions
    const hasPermission = await this.permissionsService.checkUserPermission(
      userId,
      resource,
      action
    );

    this.logger.debug(`[PermissionGuard] Checking permission: resource=${resource}, action=${action}, result=${hasPermission}`);
    return hasPermission;
  }
}

