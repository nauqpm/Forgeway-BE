import { ForbiddenException } from '@nestjs/common';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { StoryAuthorizationService } from './story-authorization.service';

describe('StoryAuthorizationService', () => {
  const service = new StoryAuthorizationService();

  it('returns a new immutable permission list for a human actor', () => {
    const permissions = [
      WORKSPACE_PERMISSIONS.STORY_READ,
      WORKSPACE_PERMISSIONS.STORY_APPROVE,
    ];

    const effective = service.getEffectivePermissions({
      kind: 'human',
      userId: 'human-1',
      permissions,
    });

    expect(effective).toEqual(permissions);
    expect(effective).not.toBe(permissions);
    expect(Object.isFrozen(effective)).toBe(true);
  });

  it('intersects agent membership and token scopes without human-only permissions', () => {
    const effective = service.getEffectivePermissions({
      kind: 'agent',
      agentId: 'agent-1',
      memberPermissions: [
        WORKSPACE_PERMISSIONS.STORY_READ,
        WORKSPACE_PERMISSIONS.STORY_SUBMIT,
        WORKSPACE_PERMISSIONS.STORY_APPROVE,
        WORKSPACE_PERMISSIONS.STORY_SUPERSEDE,
        WORKSPACE_PERMISSIONS.DECISION_APPROVE,
        WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT,
      ],
      tokenScopes: [
        WORKSPACE_PERMISSIONS.STORY_READ,
        WORKSPACE_PERMISSIONS.STORY_APPROVE,
        WORKSPACE_PERMISSIONS.STORY_SUPERSEDE,
        WORKSPACE_PERMISSIONS.DECISION_APPROVE,
        WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT,
      ],
    });

    expect(effective).toEqual([WORKSPACE_PERMISSIONS.STORY_READ]);
    expect(Object.isFrozen(effective)).toBe(true);
  });

  it('accepts only a human actor with the required approval permission', () => {
    const actor = {
      kind: 'human' as const,
      userId: 'human-1',
      permissions: [WORKSPACE_PERMISSIONS.STORY_APPROVE],
    };

    expect(() =>
      service.assertHumanPermission(actor, WORKSPACE_PERMISSIONS.STORY_APPROVE),
    ).not.toThrow();
  });

  it.each([
    {
      kind: 'human' as const,
      userId: 'human-1',
      permissions: [WORKSPACE_PERMISSIONS.STORY_READ],
    },
    {
      kind: 'agent' as const,
      agentId: 'agent-1',
      memberPermissions: [WORKSPACE_PERMISSIONS.STORY_APPROVE],
      tokenScopes: [WORKSPACE_PERMISSIONS.STORY_APPROVE],
    },
  ])('rejects actors that cannot perform human approval', actor => {
    expect(() =>
      service.assertHumanPermission(actor, WORKSPACE_PERMISSIONS.STORY_APPROVE),
    ).toThrow(
      new ForbiddenException({
        code: 'APPROVAL_PERMISSION_REQUIRED',
        message: 'APPROVAL_PERMISSION_REQUIRED',
      }),
    );
  });
});
