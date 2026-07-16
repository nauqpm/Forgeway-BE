import { reconcileWorkspaceOrganizationBindings } from './workspace-organization-reconciliation.service';

describe('reconcileWorkspaceOrganizationBindings', () => {
  const now = new Date('2026-07-16T00:00:00.000Z');

  it('reports invalid bindings and memberships without mutating input', () => {
    const input = {
      legacyOrganizationId: 'legacy',
      now,
      organizations: [{ id: 'legacy', status: 'active' }],
      users: [
        { id: 'owner', active: true },
        { id: 'member', active: true },
      ],
      memberships: [
        {
          organizationId: 'legacy',
          userId: 'owner',
          role: 'owner',
          status: 'active',
        },
        {
          organizationId: 'other',
          userId: 'member',
          role: 'member',
          status: 'suspended',
        },
      ],
      workspaces: [
        { id: 'missing-binding', ownerId: 'owner', members: [] },
        {
          id: 'wrong-membership',
          organizationId: 'legacy',
          ownerId: 'owner',
          members: [{ userId: 'member' }],
        },
      ],
    };

    const report = reconcileWorkspaceOrganizationBindings(input);

    expect(report.scannedWorkspaces).toBe(2);
    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_ORGANIZATION_BINDING',
          workspaceId: 'missing-binding',
        }),
        expect.objectContaining({
          code: 'MEMBERSHIP_ORGANIZATION_MISMATCH',
          workspaceId: 'wrong-membership',
          userId: 'member',
        }),
      ]),
    );
    expect(input.workspaces[0].organizationId).toBeUndefined();
  });

  it('passes a valid dataset with an active unexpired legacy owner', () => {
    const report = reconcileWorkspaceOrganizationBindings({
      legacyOrganizationId: 'legacy',
      now,
      organizations: [{ id: 'legacy', status: 'active' }],
      users: [
        { id: 'owner', active: true },
        { id: 'member', active: true },
      ],
      memberships: [
        {
          organizationId: 'legacy',
          userId: 'owner',
          role: 'owner',
          status: 'active',
        },
        {
          organizationId: 'legacy',
          userId: 'member',
          role: 'member',
          status: 'active',
        },
      ],
      workspaces: [
        {
          id: 'workspace',
          organizationId: 'legacy',
          ownerId: 'owner',
          members: [{ userId: 'member' }],
        },
      ],
    });

    expect(report.conflicts).toEqual([]);
  });
});
