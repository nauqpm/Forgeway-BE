export type ReconciliationConflictCode =
  | 'MISSING_ORGANIZATION_BINDING'
  | 'ORGANIZATION_NOT_FOUND'
  | 'ORGANIZATION_DEACTIVATED'
  | 'MISSING_WORKSPACE_OWNER'
  | 'MISSING_USER'
  | 'MISSING_ACTIVE_MEMBERSHIP'
  | 'MEMBERSHIP_INACTIVE'
  | 'MEMBERSHIP_EXPIRED'
  | 'MEMBERSHIP_ORGANIZATION_MISMATCH'
  | 'LEGACY_ORGANIZATION_NO_ACTIVE_OWNER';

type Input = {
  legacyOrganizationId?: string;
  now: Date;
  organizations: { id: string; status: string }[];
  users: { id: string; active: boolean }[];
  memberships: {
    organizationId: string;
    userId: string;
    role: string;
    status: string;
    expiresAt?: Date | null;
  }[];
  workspaces: {
    id: string;
    organizationId?: string | null;
    ownerId?: string;
    members: { userId: string }[];
  }[];
};

export function reconcileWorkspaceOrganizationBindings(input: Input) {
  const conflicts: {
    code: ReconciliationConflictCode;
    workspaceId?: string;
    userId?: string;
  }[] = [];
  const organizations = new Map(
    input.organizations.map(organization => [organization.id, organization]),
  );
  const users = new Map(input.users.map(user => [user.id, user]));
  const memberships = new Map(
    input.memberships.map(membership => [
      `${membership.organizationId}:${membership.userId}`,
      membership,
    ]),
  );
  const activeMembership = (
    organizationId: string,
    userId: string,
    workspaceId: string,
  ) => {
    const membership = memberships.get(`${organizationId}:${userId}`);
    if (!membership) {
      conflicts.push({
        code: 'MISSING_ACTIVE_MEMBERSHIP',
        workspaceId,
        userId,
      });
      return;
    }
    if (membership.status !== 'active') {
      conflicts.push({ code: 'MEMBERSHIP_INACTIVE', workspaceId, userId });
      return;
    }
    if (membership.expiresAt && membership.expiresAt <= input.now)
      conflicts.push({ code: 'MEMBERSHIP_EXPIRED', workspaceId, userId });
  };
  for (const workspace of input.workspaces) {
    if (!workspace.organizationId) {
      conflicts.push({
        code: 'MISSING_ORGANIZATION_BINDING',
        workspaceId: workspace.id,
      });
      continue;
    }
    const organization = organizations.get(workspace.organizationId);
    if (!organization) {
      conflicts.push({
        code: 'ORGANIZATION_NOT_FOUND',
        workspaceId: workspace.id,
      });
      continue;
    }
    if (organization.status !== 'active') {
      conflicts.push({
        code: 'ORGANIZATION_DEACTIVATED',
        workspaceId: workspace.id,
      });
      continue;
    }
    if (!workspace.ownerId) {
      conflicts.push({
        code: 'MISSING_WORKSPACE_OWNER',
        workspaceId: workspace.id,
      });
      continue;
    }
    for (const userId of [
      workspace.ownerId,
      ...workspace.members.map(member => member.userId),
    ]) {
      if (!users.get(userId)?.active) {
        conflicts.push({
          code: 'MISSING_USER',
          workspaceId: workspace.id,
          userId,
        });
        continue;
      }
      const wrong = input.memberships.find(
        membership =>
          membership.userId === userId &&
          membership.organizationId !== workspace.organizationId,
      );
      if (wrong && !memberships.has(`${workspace.organizationId}:${userId}`))
        conflicts.push({
          code: 'MEMBERSHIP_ORGANIZATION_MISMATCH',
          workspaceId: workspace.id,
          userId,
        });
      else activeMembership(workspace.organizationId, userId, workspace.id);
    }
  }
  if (input.legacyOrganizationId) {
    const hasOwner = input.memberships.some(
      membership =>
        membership.organizationId === input.legacyOrganizationId &&
        membership.role === 'owner' &&
        membership.status === 'active' &&
        (!membership.expiresAt || membership.expiresAt > input.now),
    );
    if (!hasOwner)
      conflicts.push({ code: 'LEGACY_ORGANIZATION_NO_ACTIVE_OWNER' });
  }
  return { scannedWorkspaces: input.workspaces.length, conflicts };
}
