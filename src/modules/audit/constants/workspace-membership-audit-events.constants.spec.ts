import { WORKSPACE_MEMBERSHIP_AUDIT_EVENTS } from './workspace-membership-audit-events.constants';

describe('WORKSPACE_MEMBERSHIP_AUDIT_EVENTS', () => {
  it('exposes the complete PR 5 audit contract', () => {
    expect(Object.values(WORKSPACE_MEMBERSHIP_AUDIT_EVENTS)).toEqual(
      expect.arrayContaining([
        'workspace.membership.created',
        'workspace.membership.invited',
        'workspace.membership.activated',
        'workspace.membership.role_changed',
        'workspace.membership.suspended',
        'workspace.membership.reactivated',
        'workspace.membership.left',
        'workspace.membership.removed',
        'workspace.membership.owner_synced',
        'workspace.membership.dual_write_failed',
        'workspace.membership.shadow_error',
        'workspace.membership.divergence',
      ]),
    );
  });
});
