export type ApplyStatus =
  | 'success'
  | 'completed_with_conflicts'
  | 'blocked'
  | 'failed';

export type BackfillWorkspace = {
  id: string;
  ownerId: string;
  members: { userId: string; role: string }[];
};

export interface WorkspaceOrganizationBackfillStore {
  transaction<T>(operation: (transaction: unknown) => Promise<T>): Promise<T>;
  bootstrapLegacyOrganization(
    transaction: unknown,
  ): Promise<{ organizationId: string; created: boolean }>;
  ensureMembership(
    transaction: unknown,
    input: {
      organizationId: string;
      userId: string;
      role: 'owner' | 'member' | 'guest';
      membershipType: 'employee' | 'guest';
    },
  ): Promise<'created' | 'reused'>;
  bindWorkspace(
    transaction: unknown,
    input: { workspaceId: string; organizationId: string },
  ): Promise<'bound' | 'already_bound' | 'bound_elsewhere' | 'missing'>;
}

class WorkspaceBindConflict extends Error {
  constructor(
    readonly code: 'WORKSPACE_NOT_FOUND' | 'WORKSPACE_ALREADY_BOUND_ELSEWHERE',
  ) {
    super(code);
  }
}

export class WorkspaceOrganizationBackfillApplyService {
  constructor(private readonly store: WorkspaceOrganizationBackfillStore) {}

  async apply(input: { confirm: boolean; workspaces: BackfillWorkspace[] }) {
    const report = {
      status: 'success' as ApplyStatus,
      createdOrganizations: 0,
      createdMemberships: 0,
      reusedMemberships: 0,
      updatedWorkspaces: 0,
      alreadyBoundWorkspaces: 0,
      conflicts: [] as { code: string; workspaceId?: string }[],
      failedWorkspaceId: undefined as string | undefined,
    };
    if (!input.confirm)
      return {
        ...report,
        status: 'blocked' as ApplyStatus,
        conflicts: [{ code: 'CONFIRMATION_REQUIRED' }],
      };
    let organizationId: string;
    try {
      const bootstrap = await this.store.transaction(transaction =>
        this.store.bootstrapLegacyOrganization(transaction),
      );
      organizationId = bootstrap.organizationId;
      report.createdOrganizations = bootstrap.created ? 1 : 0;
    } catch {
      return {
        ...report,
        status: 'blocked' as ApplyStatus,
        conflicts: [{ code: 'BOOTSTRAP_TRANSACTION_FAILED' }],
      };
    }
    for (const workspace of input.workspaces) {
      const local = {
        created: 0,
        reused: 0,
        outcome: 'bound' as Awaited<
          ReturnType<WorkspaceOrganizationBackfillStore['bindWorkspace']>
        >,
      };
      try {
        await this.store.transaction(async transaction => {
          const memberships = new Map<
            string,
            {
              role: 'owner' | 'member' | 'guest';
              membershipType: 'employee' | 'guest';
            }
          >([
            [workspace.ownerId, { role: 'member', membershipType: 'employee' }],
          ]);
          for (const member of workspace.members)
            memberships.set(
              member.userId,
              member.role === 'viewer'
                ? { role: 'guest', membershipType: 'guest' }
                : { role: 'member', membershipType: 'employee' },
            );
          for (const [userId, membership] of memberships) {
            const outcome = await this.store.ensureMembership(transaction, {
              organizationId,
              userId,
              ...membership,
            });
            if (outcome === 'created') local.created++;
            else local.reused++;
          }
          local.outcome = await this.store.bindWorkspace(transaction, {
            workspaceId: workspace.id,
            organizationId,
          });
          if (local.outcome === 'bound_elsewhere')
            throw new WorkspaceBindConflict(
              'WORKSPACE_ALREADY_BOUND_ELSEWHERE',
            );
          if (local.outcome === 'missing')
            throw new WorkspaceBindConflict('WORKSPACE_NOT_FOUND');
        });
      } catch (error) {
        if (error instanceof WorkspaceBindConflict) {
          report.conflicts.push({
            code: error.code,
            workspaceId: workspace.id,
          });
          continue;
        }
        report.status = 'failed';
        report.failedWorkspaceId = workspace.id;
        return report;
      }
      report.createdMemberships += local.created;
      report.reusedMemberships += local.reused;
      if (local.outcome === 'bound') report.updatedWorkspaces++;
      else report.alreadyBoundWorkspaces++;
    }
    if (report.conflicts.length) report.status = 'completed_with_conflicts';
    return report;
  }
}
