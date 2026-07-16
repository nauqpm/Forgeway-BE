import type { Model, Types } from 'mongoose';
import { SPACE_ROLES } from '../../common/constants/space-role.constants';
import { GLOBAL_ROLES } from '../../common/constants/global-role.constants';
import { getPermissionsForWorkspaceRole } from '../../common/constants/workspace-permissions.constants';
import type { WorkspaceDocument } from '../workspaces/schemas/workspace.schema';
import type {
  AuthorizationContext,
  AuthorizationRequest,
  ResolvedRole,
} from './authorization.types';

type WorkspaceRecord = {
  ownerId: Types.ObjectId;
  members: { userId: Types.ObjectId; role: string }[];
};

export async function resolveWorkspaceAuthorizationContext(
  workspaceModel: Pick<Model<WorkspaceDocument>, 'findById'>,
  request: AuthorizationRequest,
): Promise<AuthorizationContext | undefined> {
  if (request.resource.type !== 'workspace') return undefined;
  const workspaceId = request.resource.id;
  if (!workspaceId) return undefined;

  const workspace = (await workspaceModel
    .findById(workspaceId)
    .lean()) as WorkspaceRecord | null;
  if (!workspace) return undefined;

  const isSuperAdmin = request.globalRole === GLOBAL_ROLES.SUPER_ADMIN;
  const isOwner = workspace.ownerId.toString() === request.userId;
  const membership = workspace.members.find(
    member => member.userId.toString() === request.userId,
  );
  const role =
    isSuperAdmin || isOwner ? SPACE_ROLES.WORKSPACE_ADMIN : membership?.role;
  const resolvedRole: ResolvedRole[] = role
    ? [
        {
          scope: 'workspace',
          role,
          source: isSuperAdmin
            ? 'global'
            : isOwner
              ? 'owner'
              : 'legacy_workspace',
        },
      ]
    : [];

  return {
    userId: request.userId,
    resource: request.resource,
    roles: resolvedRole,
    effectivePermissions: getPermissionsForWorkspaceRole(role),
    restrictions: role ? [] : ['WORKSPACE_MEMBERSHIP_REQUIRED'],
  };
}
