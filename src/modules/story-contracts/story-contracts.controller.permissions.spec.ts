import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  WORKSPACE_PERMISSIONS,
  getPermissionsForWorkspaceRole,
} from '../../common/constants/workspace-permissions.constants';
import { SPACE_ROLES } from '../../common/constants/space-role.constants';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirementsController } from '../requirements/requirements.controller';
import { StoryContractsController } from './story-contracts.controller';
import { StoryTaskImpactController } from './story-task-impact.controller';

describe('Story Governance controller permissions', () => {
  it.each([
    StoryContractsController,
    StoryTaskImpactController,
    RequirementsController,
  ])('%p applies JWT before Workspace authorization', controller => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      JwtAuthGuard,
      WorkspaceRoleGuard,
    ]);
  });

  it('keeps the approved member, viewer, and administrator matrix exact', () => {
    const member = getPermissionsForWorkspaceRole(SPACE_ROLES.MEMBER);
    const viewer = getPermissionsForWorkspaceRole(SPACE_ROLES.VIEWER);
    const admin = getPermissionsForWorkspaceRole(SPACE_ROLES.WORKSPACE_ADMIN);

    expect(member).toEqual(
      expect.arrayContaining([
        WORKSPACE_PERMISSIONS.STORY_CREATE,
        WORKSPACE_PERMISSIONS.STORY_SUBMIT,
        WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT,
        WORKSPACE_PERMISSIONS.CRITERION_SUBMIT_VERIFICATION,
      ]),
    );
    expect(member).not.toContain(WORKSPACE_PERMISSIONS.STORY_APPROVE);
    expect(viewer).toEqual(
      expect.arrayContaining([
        WORKSPACE_PERMISSIONS.STORY_READ,
        WORKSPACE_PERMISSIONS.STORY_COMPARE_VERSIONS,
        WORKSPACE_PERMISSIONS.STORY_READ_IMPACT,
      ]),
    );
    expect(viewer).not.toContain(WORKSPACE_PERMISSIONS.STORY_CREATE);
    expect(admin).toEqual(Object.values(WORKSPACE_PERMISSIONS));
  });
});
