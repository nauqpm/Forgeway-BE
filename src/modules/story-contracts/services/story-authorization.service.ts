import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  WORKSPACE_PERMISSIONS,
  WorkspacePermission,
  getPermissionsForWorkspaceRole,
} from '../../../common/constants/workspace-permissions.constants';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { APPROVAL_PERMISSION_REQUIRED } from '../constants/story-contract.constants';

export type StoryActor =
  | {
      kind: 'human';
      userId: string;
      permissions: readonly WorkspacePermission[];
    }
  | {
      kind: 'agent';
      agentId: string;
      memberPermissions: readonly WorkspacePermission[];
      tokenScopes: readonly WorkspacePermission[];
    };

const HUMAN_ONLY_PERMISSIONS = new Set<WorkspacePermission>([
  WORKSPACE_PERMISSIONS.STORY_APPROVE,
  WORKSPACE_PERMISSIONS.STORY_SUPERSEDE,
  WORKSPACE_PERMISSIONS.DECISION_APPROVE,
  WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT,
]);

@Injectable()
export class StoryAuthorizationService {
  refreshWorkspaceActor(workspace: any, actor: StoryActor): StoryActor {
    const actorId = actor.kind === 'human' ? actor.userId : actor.agentId;
    const role =
      String(workspace.ownerId) === actorId
        ? SPACE_ROLES.WORKSPACE_ADMIN
        : workspace.members?.find(
            (member: any) => String(member.userId) === actorId,
          )?.role;
    const permissions = getPermissionsForWorkspaceRole(role);
    return actor.kind === 'human'
      ? { ...actor, permissions }
      : { ...actor, memberPermissions: permissions };
  }

  getEffectivePermissions(actor: StoryActor): readonly WorkspacePermission[] {
    const permissions =
      actor.kind === 'human'
        ? [...actor.permissions]
        : actor.memberPermissions.filter(
            permission =>
              actor.tokenScopes.includes(permission) &&
              !HUMAN_ONLY_PERMISSIONS.has(permission),
          );

    return Object.freeze(permissions);
  }

  assertHumanPermission(
    actor: StoryActor,
    permission: WorkspacePermission,
  ): asserts actor is Extract<StoryActor, { kind: 'human' }> {
    if (
      actor.kind !== 'human' ||
      !this.getEffectivePermissions(actor).includes(permission)
    ) {
      throw new ForbiddenException({
        code: APPROVAL_PERMISSION_REQUIRED,
        message: APPROVAL_PERMISSION_REQUIRED,
      });
    }
  }

  assertPermission(actor: StoryActor, permission: WorkspacePermission): void {
    if (!this.getEffectivePermissions(actor).includes(permission)) {
      throw new ForbiddenException(`Missing story permission: ${permission}`);
    }
  }
}
