import { reconcileWorkspaceMemberships } from './workspace-membership-reconciliation.service';

describe('reconcileWorkspaceMemberships', () => {
  it('reports missing owner and embedded memberships without mutating input', () => {
    const input = {
      now: new Date('2026-07-16T00:00:00Z'),
      workspace: {
        id: 'workspace',
        organizationId: 'organization',
        ownerId: 'owner',
        members: [{ userId: 'member', role: 'member' }],
      },
      memberships: [],
      organizationMemberships: [],
    };

    expect(reconcileWorkspaceMemberships(input).map(item => item.code)).toEqual(
      expect.arrayContaining([
        'OWNER_MEMBERSHIP_MISSING',
        'WORKSPACE_MEMBERSHIP_MISSING',
      ]),
    );
    expect(input.workspace.members).toHaveLength(1);
  });

  it('accepts parity for an active owner and member', () => {
    expect(
      reconcileWorkspaceMemberships({
        now: new Date('2026-07-16T00:00:00Z'),
        workspace: {
          id: 'workspace',
          organizationId: 'organization',
          ownerId: 'owner',
          members: [{ userId: 'member', role: 'member' }],
        },
        memberships: [
          {
            userId: 'owner',
            organizationId: 'organization',
            role: 'workspace_admin',
            status: 'active',
            source: 'owner',
          },
          {
            userId: 'member',
            organizationId: 'organization',
            role: 'member',
            status: 'active',
            source: 'legacy_embedded',
          },
        ],
        organizationMemberships: [
          { userId: 'owner', organizationId: 'organization', status: 'active' },
          {
            userId: 'member',
            organizationId: 'organization',
            status: 'active',
          },
        ],
      }),
    ).toEqual([]);
  });
});
