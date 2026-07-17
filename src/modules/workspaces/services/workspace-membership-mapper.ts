import { BadRequestException } from '@nestjs/common';
import {
  SPACE_ROLES,
  SpaceRole,
} from '@/common/constants/space-role.constants';
import { WorkspaceMembershipSource } from '../schemas/workspace-membership.schema';

export interface MembershipProjection {
  workspaceId: string;
  organizationId: string;
  userId: string;
  role: SpaceRole;
  status: 'invited' | 'active' | 'suspended' | 'left' | 'removed';
  source: WorkspaceMembershipSource;
  joinedAt?: Date | null;
  expiresAt?: Date | null;
}
export function legacyMemberToWorkspaceMembership(input: {
  workspaceId: string;
  organizationId: string;
  ownerId: string;
  member: { userId: string; role: string };
}): MembershipProjection {
  const isOwner = input.member.userId === input.ownerId;
  if (
    !isOwner &&
    !Object.values(SPACE_ROLES).includes(input.member.role as SpaceRole)
  )
    throw new BadRequestException('UNKNOWN_LEGACY_WORKSPACE_ROLE');
  return {
    workspaceId: input.workspaceId,
    organizationId: input.organizationId,
    userId: input.member.userId,
    role: isOwner
      ? SPACE_ROLES.WORKSPACE_ADMIN
      : (input.member.role as SpaceRole),
    status: 'active',
    source: isOwner ? 'owner' : 'legacy_embedded',
  };
}
export function workspaceMembershipToLegacyMember(
  membership: MembershipProjection,
): { userId: string; role: SpaceRole } {
  return { userId: membership.userId, role: membership.role };
}
