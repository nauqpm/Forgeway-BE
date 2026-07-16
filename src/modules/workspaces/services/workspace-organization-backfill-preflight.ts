export type WorkspaceBackfillConflict = {
  code:
    | 'LEGACY_OWNER_INVALID'
    | 'TRANSACTION_UNAVAILABLE'
    | 'MISSING_WORKSPACE_OWNER'
    | 'MISSING_USER';
  workspaceId?: string;
  userId?: string;
};

export type WorkspaceBackfillPreflightInput = {
  configuredOwnerValid: boolean;
  transactionAvailable: boolean;
  legacyOrganizationValid: boolean;
  workspaces: { id: string; ownerId?: string; memberIds: string[] }[];
  activeUserIds: Set<string>;
};

export function buildWorkspaceOrganizationPreflight(
  input: WorkspaceBackfillPreflightInput,
) {
  const conflicts: WorkspaceBackfillConflict[] = [];
  if (!input.configuredOwnerValid)
    conflicts.push({ code: 'LEGACY_OWNER_INVALID' });
  if (!input.transactionAvailable)
    conflicts.push({ code: 'TRANSACTION_UNAVAILABLE' });
  if (!input.legacyOrganizationValid)
    conflicts.push({ code: 'LEGACY_OWNER_INVALID' });
  const candidateWorkspaceIds: string[] = [];
  for (const workspace of input.workspaces) {
    if (!workspace.ownerId) {
      conflicts.push({
        code: 'MISSING_WORKSPACE_OWNER',
        workspaceId: workspace.id,
      });
      continue;
    }
    const users = [workspace.ownerId, ...workspace.memberIds];
    const missingUserId = users.find(
      userId => !input.activeUserIds.has(userId),
    );
    if (missingUserId) {
      conflicts.push({
        code: 'MISSING_USER',
        workspaceId: workspace.id,
        userId: missingUserId,
      });
      continue;
    }
    candidateWorkspaceIds.push(workspace.id);
  }
  const blocked = conflicts.some(conflict => !conflict.workspaceId);
  return { blocked, conflicts, candidateWorkspaceIds };
}
