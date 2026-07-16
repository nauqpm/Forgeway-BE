export const ORGANIZATION_STATUSES = [
  'active',
  'suspended',
  'deactivated',
] as const;
export const ORGANIZATION_ROLES = [
  'owner',
  'organization_admin',
  'security_admin',
  'member',
  'guest',
] as const;
export const MEMBERSHIP_TYPES = [
  'employee',
  'contractor',
  'guest',
  'external',
] as const;
export const MEMBERSHIP_STATUSES = [
  'invited',
  'active',
  'suspended',
  'left',
  'removed',
] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface OrganizationSettings {
  createEmployeeProfileForContractor?: boolean;
}
