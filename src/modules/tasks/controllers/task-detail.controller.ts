import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { TaskDetailDto } from '../dtos/responses/task-detail.dto';
import { TaskDetailService } from '../services/task-detail.service';
import { TaskAuditService } from '../shared/task-audit.service';
import { Request as ExpressRequest } from 'express';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class TaskDetailController {
  constructor(
    private readonly taskDetailService: TaskDetailService,
    private readonly taskAuditService: TaskAuditService,
  ) {}

  @Get(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task detail by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findById(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDetailDto> {
    try {
      const task = await this.taskDetailService.getDetailByIdInWorkspaceKey(
        workspaceId,
        id,
        user.userId,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_VIEWED,
        {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          viewedFrom: 'id',
        },
      );
      return task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_VIEWED,
        error,
        {
          workspaceId,
          taskId: id,
        },
      );
      throw error;
    }
  }

  @Get('key/:taskKey')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task detail by generated task key' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDetailDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findByTaskKey(
    @Param('workspaceId') workspaceId: string,
    @Param('taskKey') taskKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDetailDto> {
    try {
      const task = await this.taskDetailService.getDetailByKeyInWorkspaceKey(
        workspaceId,
        taskKey,
        user.userId,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_VIEWED,
        {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          viewedFrom: 'key',
        },
      );
      return task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_VIEWED,
        error,
        {
          workspaceId,
          taskKey,
        },
      );
      throw error;
    }
  }
}
