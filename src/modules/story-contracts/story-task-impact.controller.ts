import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  WORKSPACE_PERMISSIONS,
  WorkspacePermission,
} from '../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { StoryImpactService } from './services/story-impact.service';
import { SPACE_ROLES } from '../../common/constants/space-role.constants';

@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:workspaceId')
export class StoryTaskImpactController {
  constructor(private readonly impacts: StoryImpactService) {}

  @Post(
    'story-contracts/:storyContractId/versions/:storyVersionId/tasks/:taskId/link',
  )
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT)
  link(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
  ) {
    return this.impacts.linkTask(
      workspaceId,
      storyContractId,
      storyVersionId,
      taskId,
    );
  }

  @Get('story-contracts/:storyContractId/versions/:storyVersionId/impact')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ_IMPACT)
  versionImpact(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
  ) {
    return this.impacts.findVersionImpact(
      workspaceId,
      storyContractId,
      storyVersionId,
    );
  }

  @Get('tasks/:taskId/story-impact')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ_IMPACT)
  taskImpact(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
  ) {
    return this.impacts.findTaskImpact(workspaceId, taskId);
  }

  @Post('tasks/:taskId/story-impact/:assessmentId/resolve')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT)
  resolve(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('assessmentId', ParseObjectIdPipe) assessmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req()
    request: {
      workspaceAuth?: { role: string; permissions: WorkspacePermission[] };
    },
  ) {
    return this.impacts.resolve(
      workspaceId,
      taskId,
      assessmentId,
      {
        userId: user.userId,
        isAdmin: request.workspaceAuth?.role === SPACE_ROLES.WORKSPACE_ADMIN,
      },
      idempotencyKey,
    );
  }
}
