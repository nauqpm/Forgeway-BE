import { SetMetadata } from '@nestjs/common';
import { WorkspacePermission } from '../constants/workspace-permissions.constants';

export const REQUIRED_WORKSPACE_PERMISSIONS_KEY =
  'requiredWorkspacePermissions';

export const RequirePermissions = (...permissions: WorkspacePermission[]) =>
  SetMetadata(REQUIRED_WORKSPACE_PERMISSIONS_KEY, permissions);
