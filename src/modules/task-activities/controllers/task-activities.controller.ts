import {
  Controller,
  Get,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { TaskActivityDto } from '../dtos/task-activity.dto';
import { TaskActivitiesService } from '../services/task-activities.service';

@ApiTags('Task Activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:key/board/:taskId/activities')
export class TaskActivitiesController {
  constructor(
    private readonly taskActivitiesService: TaskActivitiesService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List task activity history for task detail UI' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskActivityDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findByTask(
    @Param('key') key: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskActivityDto[]> {
    return this.taskActivitiesService.findByTaskInWorkspaceKey(
      key,
      taskId,
      user.userId,
    );
  }
}
