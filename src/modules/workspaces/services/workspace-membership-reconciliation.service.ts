import { SPACE_ROLES } from '@/common/constants/space-role.constants';
export type WorkspaceMembershipConflictCode =
  | 'WORKSPACE_ORGANIZATION_MISSING'
  | 'OWNER_MEMBERSHIP_MISSING'
  | 'OWNER_MEMBERSHIP_ROLE_MISMATCH'
  | 'WORKSPACE_MEMBERSHIP_MISSING'
  | 'WORKSPACE_MEMBERSHIP_ROLE_MISMATCH'
  | 'WORKSPACE_MEMBERSHIP_STATUS_MISMATCH'
  | 'WORKSPACE_MEMBERSHIP_ORG_MISMATCH'
  | 'ORGANIZATION_MEMBERSHIP_MISSING'
  | 'ORGANIZATION_MEMBERSHIP_INACTIVE'
  | 'ORGANIZATION_MEMBERSHIP_EXPIRED'
  | 'MEMBERSHIP_PRESENT_ONLY_IN_NEW_MODEL';
export interface WorkspaceMembershipConflict {
  code: WorkspaceMembershipConflictCode;
  workspaceId: string;
  userId?: string;
}
type Membership = {
  userId: string;
  organizationId: string;
  role: string;
  status: string;
  source?: string;
  expiresAt?: Date | null;
};
export function reconcileWorkspaceMemberships(input: {
  now: Date;
  workspace: {
    id: string;
    organizationId?: string | null;
    ownerId?: string | null;
    members: { userId: string; role: string }[];
  };
  memberships: Membership[];
  organizationMemberships: {
    userId: string;
    organizationId: string;
    status: string;
    expiresAt?: Date | null;
  }[];
}): WorkspaceMembershipConflict[] {
  const conflicts: WorkspaceMembershipConflict[] = [];
  const { workspace } = input;
  if (!workspace.organizationId)
    return [
      { code: 'WORKSPACE_ORGANIZATION_MISSING', workspaceId: workspace.id },
    ];
  const activeOrg = (userId: string) =>
    input.organizationMemberships.find(
      item =>
        item.userId === userId &&
        item.organizationId === workspace.organizationId,
    );
  const assertOrg = (userId: string) => {
    const item = activeOrg(userId);
    if (!item)
      conflicts.push({
        code: 'ORGANIZATION_MEMBERSHIP_MISSING',
        workspaceId: workspace.id,
        userId,
      });
    else if (item.status !== 'active')
      conflicts.push({
        code: 'ORGANIZATION_MEMBERSHIP_INACTIVE',
        workspaceId: workspace.id,
        userId,
      });
    else if (item.expiresAt && item.expiresAt <= input.now)
      conflicts.push({
        code: 'ORGANIZATION_MEMBERSHIP_EXPIRED',
        workspaceId: workspace.id,
        userId,
      });
  };
  const find = (userId: string) =>
    input.memberships.find(
      item =>
        item.userId === userId &&
        item.organizationId === workspace.organizationId,
    );
  if (workspace.ownerId) {
    const owner = find(workspace.ownerId);
    if (!owner)
      conflicts.push({
        code: 'OWNER_MEMBERSHIP_MISSING',
        workspaceId: workspace.id,
        userId: workspace.ownerId,
      });
    else if (
      owner.status !== 'active' ||
      owner.role !== SPACE_ROLES.WORKSPACE_ADMIN
    )
      conflicts.push({
        code: 'OWNER_MEMBERSHIP_ROLE_MISMATCH',
        workspaceId: workspace.id,
        userId: workspace.ownerId,
      });
    assertOrg(workspace.ownerId);
  }
  for (const member of workspace.members) {
    if (member.userId === workspace.ownerId) continue;
    const current = find(member.userId);
    if (!current)
      conflicts.push({
        code: 'WORKSPACE_MEMBERSHIP_MISSING',
        workspaceId: workspace.id,
        userId: member.userId,
      });
    else {
      if (current.role !== member.role)
        conflicts.push({
          code: 'WORKSPACE_MEMBERSHIP_ROLE_MISMATCH',
          workspaceId: workspace.id,
          userId: member.userId,
        });
      if (current.status !== 'active')
        conflicts.push({
          code: 'WORKSPACE_MEMBERSHIP_STATUS_MISMATCH',
          workspaceId: workspace.id,
          userId: member.userId,
        });
    }
    assertOrg(member.userId);
  }
  for (const item of input.memberships)
    if (
      item.organizationId === workspace.organizationId &&
      item.status === 'active' &&
      !workspace.members.some(member => member.userId === item.userId) &&
      item.userId !== workspace.ownerId
    )
      conflicts.push({
        code: 'MEMBERSHIP_PRESENT_ONLY_IN_NEW_MODEL',
        workspaceId: workspace.id,
        userId: item.userId,
      });
  return conflicts;
}
