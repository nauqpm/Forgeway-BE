export const WORKSPACE_MEMBERSHIP_AUDIT_EVENTS = {
  CREATED: 'workspace.membership.created',
  INVITED: 'workspace.membership.invited',
  ACTIVATED: 'workspace.membership.activated',
  ROLE_CHANGED: 'workspace.membership.role_changed',
  SUSPENDED: 'workspace.membership.suspended',
  REACTIVATED: 'workspace.membership.reactivated',
  LEFT: 'workspace.membership.left',
  REMOVED: 'workspace.membership.removed',
  OWNER_SYNCED: 'workspace.membership.owner_synced',
  DUAL_WRITE_FAILED: 'workspace.membership.dual_write_failed',
  DIVERGENCE: 'workspace.membership.divergence',
} as const;
