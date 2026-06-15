import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { GLOBAL_ROLES } from '../constants/global-role.constants';
import { SPACE_ROLES } from '../constants/space-role.constants';
import {
  WorkspacePermission,
  getPermissionsForWorkspaceRole,
} from '../constants/workspace-permissions.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PagesService } from '../../modules/pages/services/pages.service';
import { WorkspacesService } from '../../modules/workspaces/services/workspaces.service';

type WorkspaceAuthContext = {
  workspaceId: string;
  role: string;
  permissions: WorkspacePermission[];
};

type RequestWithWorkspaceAuth = {
  user?: { userId?: string; role?: string };
  params?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  workspaceAuth?: WorkspaceAuthContext;
};

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<WorkspacePermission[]>(
        REQUIRED_WORKSPACE_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithWorkspaceAuth>();
    const user = request.user;

    if (!user?.userId) {
      return false;
    }

    if (user.role === GLOBAL_ROLES.SUPER_ADMIN) {
      request.workspaceAuth = {
        workspaceId: await this.resolveWorkspaceId(request),
        role: SPACE_ROLES.WORKSPACE_ADMIN,
        permissions: getPermissionsForWorkspaceRole(
          SPACE_ROLES.WORKSPACE_ADMIN,
        ),
      };
      return true;
    }

    const workspaceAuth =
      request.workspaceAuth ??
      (await this.resolveWorkspaceAuth(request, user.userId));
    request.workspaceAuth = workspaceAuth;

    const allowed = requiredPermissions.every(permission =>
      workspaceAuth.permissions.includes(permission),
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Missing workspace permission: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  private async resolveWorkspaceAuth(
    request: RequestWithWorkspaceAuth,
    userId: string,
  ): Promise<WorkspaceAuthContext> {
    const workspaceId = await this.resolveWorkspaceId(request);
    const workspace = await this.getWorkspacesService().findById(workspaceId);
    const member = workspace.members.find(
      item => item.userId.toString() === userId,
    );
    const role =
      workspace.ownerId.toString() === userId
        ? SPACE_ROLES.WORKSPACE_ADMIN
        : member?.role;

    if (!role) {
      throw new ForbiddenException('Workspace membership required');
    }

    return {
      workspaceId,
      role,
      permissions: getPermissionsForWorkspaceRole(role),
    };
  }

  private async resolveWorkspaceId(
    request: RequestWithWorkspaceAuth,
  ): Promise<string> {
    const routeWorkspaceId = this.getStringValue(request.params?.workspaceId);
    if (routeWorkspaceId) {
      if (Types.ObjectId.isValid(routeWorkspaceId)) {
        return routeWorkspaceId;
      }

      throw new NotFoundException('Workspace context not found');
    }

    const directWorkspaceId =
      this.getStringValue(request.query?.workspaceId) ??
      this.getStringValue(request.body?.workspaceId);

    if (directWorkspaceId && Types.ObjectId.isValid(directWorkspaceId)) {
      return directWorkspaceId;
    }

    if (directWorkspaceId) {
      throw new BadRequestException(
        'workspaceId must be a valid MongoDB ObjectId',
      );
    }

    const pageId =
      this.getStringValue(request.params?.pageId) ??
      this.getStringValue(request.params?.id) ??
      this.getStringValue(request.body?.pageId);

    if (pageId && Types.ObjectId.isValid(pageId)) {
      const page = await this.getPagesService().findById(pageId);
      return page.workspaceId.toString();
    }

    throw new NotFoundException('Workspace context not found');
  }

  private getWorkspacesService(): WorkspacesService {
    return this.moduleRef.get(WorkspacesService, { strict: false });
  }

  private getPagesService(): PagesService {
    return this.moduleRef.get(PagesService, { strict: false });
  }

  private getStringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }
}
