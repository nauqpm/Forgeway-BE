import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import {
  legacyMemberToWorkspaceMembership,
  workspaceMembershipToLegacyMember,
} from './workspace-membership-mapper.service';

describe('workspace membership mapper', () => {
  const workspaceId = '507f1f77bcf86cd799439011';
  const organizationId = '507f1f77bcf86cd799439012';
  const ownerId = '507f1f77bcf86cd799439013';

  it('materializes the owner as an active workspace admin', () => {
    expect(
      legacyMemberToWorkspaceMembership({
        workspaceId,
        organizationId,
        ownerId,
        member: { userId: ownerId, role: SPACE_ROLES.VIEWER },
      }),
    ).toMatchObject({
      userId: ownerId,
      role: SPACE_ROLES.WORKSPACE_ADMIN,
      status: 'active',
      source: 'owner',
    });
  });

  it('maps legacy members without changing the compatibility shape', () => {
    const membership = legacyMemberToWorkspaceMembership({
      workspaceId,
      organizationId,
      ownerId,
      member: { userId: '507f1f77bcf86cd799439014', role: SPACE_ROLES.VIEWER },
    });

    expect(membership).toMatchObject({
      role: SPACE_ROLES.VIEWER,
      source: 'legacy_embedded',
    });
    expect(workspaceMembershipToLegacyMember(membership)).toEqual({
      userId: membership.userId,
      role: SPACE_ROLES.VIEWER,
    });
  });

  it('rejects unknown legacy roles instead of silently elevating them', () => {
    expect(() =>
      legacyMemberToWorkspaceMembership({
        workspaceId,
        organizationId,
        ownerId,
        member: { userId: '507f1f77bcf86cd799439014', role: 'unknown' },
      }),
    ).toThrow('UNKNOWN_LEGACY_WORKSPACE_ROLE');
  });
});
