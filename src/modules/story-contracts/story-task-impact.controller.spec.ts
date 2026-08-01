import 'reflect-metadata';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoryTaskImpactController } from './story-task-impact.controller';

describe('StoryTaskImpactController security metadata', () => {
  const prototype = StoryTaskImpactController.prototype;

  it('uses JWT and Workspace guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StoryTaskImpactController),
    ).toEqual([JwtAuthGuard, WorkspaceRoleGuard]);
  });

  it.each([
    ['link', WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT],
    ['versionImpact', WORKSPACE_PERMISSIONS.STORY_READ_IMPACT],
    ['taskImpact', WORKSPACE_PERMISSIONS.STORY_READ_IMPACT],
    ['resolve', WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT],
  ] as const)('%s requires its exact permission', (method, permission) => {
    expect(
      Reflect.getMetadata(
        REQUIRED_WORKSPACE_PERMISSIONS_KEY,
        prototype[method],
      ),
    ).toEqual([permission]);
  });

  it.each([
    ['link', ['workspaceId', 'storyContractId', 'storyVersionId', 'taskId']],
    ['versionImpact', ['workspaceId', 'storyContractId', 'storyVersionId']],
    ['taskImpact', ['workspaceId', 'taskId']],
    ['resolve', ['workspaceId', 'taskId', 'assessmentId']],
  ] as const)('%s validates every scoped id', (method, ids) => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryTaskImpactController,
      method,
    );

    for (const id of ids) {
      expect(Object.values(parameters)).toContainEqual(
        expect.objectContaining({
          data: id,
          pipes: [ParseObjectIdPipe],
        }),
      );
    }
  });
});
