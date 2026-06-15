import {
  Injectable,
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Type,
  mixin,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Types } from 'mongoose';
import { SPACE_ROLES, SpaceRole } from '../constants/space-role.constants';
import { GLOBAL_ROLES } from '../constants/global-role.constants';
import { WorkspacesService } from '../../modules/workspaces/services/workspaces.service';
import { TasksService } from '../../modules/tasks/services/tasks.service';
import { PagesService } from '../../modules/pages/services/pages.service';

export const ScopedRoleGuard = (
  resourceType: 'workspace' | 'task' | 'page',
  requiredRole: SpaceRole = SPACE_ROLES.VIEWER,
): Type<CanActivate> => {
  @Injectable()
  class ScopedRoleGuardMixin implements CanActivate {
    constructor(private readonly moduleRef: ModuleRef) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user) {
        return false;
      }

      // Tầng 1: Super Admin luôn có quyền
      if (user.role === GLOBAL_ROLES.SUPER_ADMIN) {
        return true;
      }

      const routeWorkspaceId = request.params?.workspaceId;
      if (
        resourceType === 'workspace' &&
        routeWorkspaceId &&
        !Types.ObjectId.isValid(routeWorkspaceId)
      ) {
        throw new NotFoundException('Workspace not found');
      }

      const resourceId =
        request.params?.id || routeWorkspaceId || request.body?.workspaceId;

      if (!resourceId) {
        return true;
      }

      const workspacesService = this.moduleRef.get(WorkspacesService, {
        strict: false,
      });

      let userRoleInResource: string | undefined;
      let targetWorkspaceId: string | undefined;

      // Phân giải resourceId về Workspace
      if (resourceType === 'task') {
        const tasksService = this.moduleRef.get(TasksService, {
          strict: false,
        });
        const task = await tasksService.findByIdForAccessCheck(resourceId);
        if (!task) throw new NotFoundException('Task not found');
        targetWorkspaceId = task.workspaceId.toString();
      } else if (resourceType === 'page') {
        const pagesService = this.moduleRef.get(PagesService, {
          strict: false,
        });
        const page = await pagesService.findById(resourceId);
        if (!page) throw new NotFoundException('Page not found');
        targetWorkspaceId = page.workspaceId.toString();
      } else if (resourceType === 'workspace') {
        try {
          if (!Types.ObjectId.isValid(resourceId)) {
            throw new BadRequestException(
              'workspaceId must be a valid MongoDB ObjectId',
            );
          }
          const workspace = await workspacesService.findById(resourceId);

          targetWorkspaceId = workspace._id.toString();
        } catch {
          throw new NotFoundException('Workspace not found');
        }
      }

      // Kiểm tra quyền dựa trên Workspace đã phân giải
      if (targetWorkspaceId) {
        const workspace = await workspacesService.findById(targetWorkspaceId);
        const member = workspace.members.find(
          m => m.userId.toString() === user.userId,
        );
        userRoleInResource =
          workspace.ownerId.toString() === user.userId
            ? SPACE_ROLES.WORKSPACE_ADMIN
            : member?.role;
      }

      if (!userRoleInResource) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập vào tài nguyên này',
        );
      }

      // Kiểm tra cấp bậc quyền: Admin > Member > Viewer
      const roleWeights: Record<string, number> = {
        [SPACE_ROLES.WORKSPACE_ADMIN]: 3,
        [SPACE_ROLES.MEMBER]: 2,
        [SPACE_ROLES.VIEWER]: 1,
      };

      if (roleWeights[userRoleInResource] < roleWeights[requiredRole]) {
        throw new ForbiddenException(
          `Yêu cầu quyền: ${requiredRole}. Quyền của bạn: ${userRoleInResource}`,
        );
      }

      return true;
    }
  }

  return mixin(ScopedRoleGuardMixin);
};
