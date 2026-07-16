import {
  MembershipStatus,
  MembershipType,
  OrganizationRole,
  OrganizationSettings,
} from '../constants/organization.constants';

const DEFAULT_ROLES: Record<MembershipType, OrganizationRole> = {
  employee: 'member',
  contractor: 'member',
  guest: 'guest',
  external: 'guest',
};

export function defaultRoleForMembershipType(
  type: MembershipType,
): OrganizationRole {
  return DEFAULT_ROLES[type];
}

export function shouldCreateEmployeeProfile(
  type: MembershipType,
  settings: OrganizationSettings,
): boolean {
  return (
    type === 'employee' ||
    (type === 'contractor' &&
      settings.createEmployeeProfileForContractor === true)
  );
}

export function isMembershipActive(
  membership: { status: MembershipStatus; expiresAt?: Date | null },
  now = new Date(),
): boolean {
  return (
    membership.status === 'active' &&
    (!membership.expiresAt || membership.expiresAt > now)
  );
}

export function isElevatedGuestRole(
  type: MembershipType,
  role: OrganizationRole,
): boolean {
  return (type === 'guest' || type === 'external') && role !== 'guest';
}
