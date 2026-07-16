import {
  WorkspaceOrganizationBackfillApplyService,
  WorkspaceOrganizationBackfillStore,
} from './workspace-organization-backfill-apply.service';

const workspace = {
  id: 'workspace-a',
  ownerId: 'owner',
  members: [{ userId: 'viewer', role: 'viewer' }],
};

describe('WorkspaceOrganizationBackfillApplyService', () => {
  it('bootstraps, creates memberships, and binds in transactions', async () => {
    const store = {
      transaction: jest.fn(async operation => operation({})),
      bootstrapLegacyOrganization: jest.fn(async () => ({
        organizationId: 'legacy',
        created: true,
      })),
      ensureMembership: jest
        .fn()
        .mockResolvedValueOnce('created')
        .mockResolvedValueOnce('created')
        .mockResolvedValueOnce('created'),
      bindWorkspace: jest.fn(async () => 'bound'),
    } as any as WorkspaceOrganizationBackfillStore;
    const report = await new WorkspaceOrganizationBackfillApplyService(
      store,
    ).apply({ confirm: true, workspaces: [workspace] });

    expect(report).toMatchObject({
      status: 'success',
      createdOrganizations: 1,
      createdMemberships: 2,
      updatedWorkspaces: 1,
    });
    expect((store.transaction as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('does not bind when membership preparation fails', async () => {
    const store = {
      transaction: jest.fn(async operation => operation({})),
      bootstrapLegacyOrganization: jest.fn(async () => ({
        organizationId: 'legacy',
        created: false,
      })),
      ensureMembership: jest
        .fn()
        .mockRejectedValue(new Error('membership write failed')),
      bindWorkspace: jest.fn(),
    } as any as WorkspaceOrganizationBackfillStore;
    const report = await new WorkspaceOrganizationBackfillApplyService(
      store,
    ).apply({ confirm: true, workspaces: [workspace] });
    expect((store.bindWorkspace as jest.Mock).mock.calls).toHaveLength(0);
    expect(report).toMatchObject({
      status: 'failed',
      failedWorkspaceId: 'workspace-a',
      updatedWorkspaces: 0,
    });
  });

  it('keeps committed work resumable after a later workspace fails', async () => {
    const store = {
      transaction: jest.fn(async operation => operation({})),
      bootstrapLegacyOrganization: jest.fn(async () => ({
        organizationId: 'legacy',
        created: false,
      })),
      ensureMembership: jest.fn(async () => 'reused'),
      bindWorkspace: jest
        .fn()
        .mockResolvedValueOnce('bound')
        .mockRejectedValueOnce(new Error('db unavailable')),
    } as any as WorkspaceOrganizationBackfillStore;
    const service = new WorkspaceOrganizationBackfillApplyService(store);
    const first = await service.apply({
      confirm: true,
      workspaces: [workspace, { ...workspace, id: 'workspace-b' }],
    });
    (store.bindWorkspace as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce('already_bound')
      .mockResolvedValueOnce('bound');
    const second = await service.apply({
      confirm: true,
      workspaces: [workspace, { ...workspace, id: 'workspace-b' }],
    });

    expect(first).toMatchObject({
      status: 'failed',
      updatedWorkspaces: 1,
      failedWorkspaceId: 'workspace-b',
    });
    expect(second).toMatchObject({
      status: 'success',
      createdOrganizations: 0,
      createdMemberships: 0,
      updatedWorkspaces: 1,
      alreadyBoundWorkspaces: 1,
    });
  });

  it('reports a conditional-bind race without committing memberships', async () => {
    const store = {
      transaction: jest.fn(async operation => operation({})),
      bootstrapLegacyOrganization: jest.fn(async () => ({
        organizationId: 'legacy',
        created: false,
      })),
      ensureMembership: jest.fn(async () => 'created'),
      bindWorkspace: jest.fn(async () => 'bound_elsewhere'),
    } as any as WorkspaceOrganizationBackfillStore;

    const report = await new WorkspaceOrganizationBackfillApplyService(
      store,
    ).apply({ confirm: true, workspaces: [workspace] });

    expect(report).toMatchObject({
      status: 'completed_with_conflicts',
      createdMemberships: 0,
      updatedWorkspaces: 0,
    });
    expect(report.conflicts).toEqual([
      { code: 'WORKSPACE_ALREADY_BOUND_ELSEWHERE', workspaceId: 'workspace-a' },
    ]);
  });
});
