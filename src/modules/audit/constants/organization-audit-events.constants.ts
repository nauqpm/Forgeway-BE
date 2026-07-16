export const ORGANIZATION_AUDIT_EVENTS = {
  ORGANIZATION_CREATED: 'organization.created',
  MEMBERSHIP_INVITED: 'organization.membership_invited',
  GUEST_EXPIRY_CONFIGURED: 'organization.guest_expiry_configured',
  MEMBERSHIP_ACCEPTED: 'organization.membership_accepted',
  MEMBERSHIP_SUSPENDED: 'organization.membership_suspended',
  MEMBERSHIP_REACTIVATED: 'organization.membership_reactivated',
  MEMBERSHIP_REMOVED: 'organization.membership_removed',
  OWNER_PROMOTED: 'organization.owner_promoted',
  OWNER_DEMOTED: 'organization.owner_demoted',
  OWNERSHIP_TRANSFERRED: 'organization.ownership_transferred',
  INVARIANT_REJECTED: 'organization.owner_invariant_rejected',
  ELEVATED_GUEST_ROLE_ASSIGNED: 'organization.elevated_guest_role_assigned',
} as const;

export type OrganizationAuditEventLiteral =
  (typeof ORGANIZATION_AUDIT_EVENTS)[keyof typeof ORGANIZATION_AUDIT_EVENTS];
