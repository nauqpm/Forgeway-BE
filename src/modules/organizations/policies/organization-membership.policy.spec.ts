import {
  defaultRoleForMembershipType,
  isElevatedGuestRole,
  isMembershipActive,
  shouldCreateEmployeeProfile,
} from './organization-membership.policy';

describe('organization membership policies', () => {
  it.each([
    ['employee', 'member'],
    ['contractor', 'member'],
    ['guest', 'guest'],
    ['external', 'guest'],
  ] as const)('maps %s to %s', (membershipType, role) => {
    expect(defaultRoleForMembershipType(membershipType)).toBe(role);
  });

  it.each([
    ['employee', {}, true],
    ['contractor', {}, false],
    ['contractor', { createEmployeeProfileForContractor: true }, true],
    ['guest', { createEmployeeProfileForContractor: true }, false],
    ['external', { createEmployeeProfileForContractor: true }, false],
  ] as const)(
    'applies the profile policy for %s',
    (type, settings, expected) => {
      expect(shouldCreateEmployeeProfile(type, settings)).toBe(expected);
    },
  );

  it('does not authorize an expired active membership', () => {
    expect(
      isMembershipActive(
        { status: 'active', expiresAt: new Date('2026-07-16T00:00:00.000Z') },
        new Date('2026-07-16T00:00:01.000Z'),
      ),
    ).toBe(false);
  });

  it('marks elevated guest roles as privileged-only', () => {
    expect(isElevatedGuestRole('guest', 'owner')).toBe(true);
    expect(isElevatedGuestRole('external', 'guest')).toBe(false);
  });
});
