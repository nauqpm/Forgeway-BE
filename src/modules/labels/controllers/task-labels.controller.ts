import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { TaskDto } from '../../tasks/dtos/responses/task.dto';
import { SetTaskLabelsDto } from '../dtos/set-task-labels.dto';
import { TaskLabelService } from '../services/task-label.service';

@ApiTags('Task Labels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board/:taskId/labels')
export class TaskLabelsController {
  constructor(private readonly taskLabelService: TaskLabelService) {}

  @Patch()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Replace labels on a task' })
  @ApiResponse({ status: 200, type: TaskDto })
  @ApiBadRequestResponse({
    description:
      'Invalid IDs, labels outside workspace, or archived task is read-only',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  async setTaskLabels(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: SetTaskLabelsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskDto> {
    return this.taskLabelService.setTaskLabels(
      workspaceId,
      taskId,
      dto,
      user.userId,
    );
  }
}
