import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Patch,
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
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { MoveTaskDto } from '../dtos/requests/move-task.dto';
import { ReorderTaskDto } from '../dtos/requests/reorder-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMoveService } from '../services/task-move.service';
import { TaskReorderService } from '../services/task-reorder.service';
import { TaskAuditService } from '../shared/task-audit.service';
import { RealtimeService } from '@/modules/realtime/realtime.service';
import { Request as ExpressRequest } from 'express';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class TaskWorkflowController {
  constructor(
    private readonly taskMoveService: TaskMoveService,
    private readonly taskReorderService: TaskReorderService,
    private readonly taskAuditService: TaskAuditService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Patch(':id/move')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_MOVE)
  @ApiOperation({
    summary: 'Move task/card across board columns or Scrum sprint scopes',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task move payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task move denied' })
  @ApiNotFoundResponse({ description: 'Task or sprint not found' })
  async move(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() moveTaskDto: MoveTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const result = await this.taskMoveService.moveInWorkspaceId(
        workspaceId,
        id,
        moveTaskDto,
        user.userId,
      );

      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_MOVE_SUCCESS,
        {
          workspaceId,
          ...result.auditMetadata,
        },
      );

      this.realtimeService.emitBoardDelta(workspaceId, 'task:moved', {
        task: result.task,
      });

      return result.task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_MOVE_FAILED,
        error,
        {
          workspaceId,
          taskId: id,
          requestedColumnId: moveTaskDto.columnId,
          requestedStatus: moveTaskDto.status,
          requestedSprintId: moveTaskDto.sprintId,
          requestedRank: moveTaskDto.rank,
        },
      );
      throw error;
    }
  }

  @Patch(':id/reorder')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_MOVE)
  @ApiOperation({ summary: 'Reorder task/card by relative neighbor tasks' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task reorder payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task reorder denied' })
  @ApiNotFoundResponse({
    description: 'Task, neighbor task, or sprint not found',
  })
  async reorder(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() reorderTaskDto: ReorderTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const result = await this.taskReorderService.reorderInWorkspaceId(
        workspaceId,
        id,
        reorderTaskDto,
        user.userId,
      );

      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_MOVE_SUCCESS,
        {
          workspaceId,
          reorder: true,
          ...result.auditMetadata,
        },
      );

      this.realtimeService.emitBoardDelta(workspaceId, 'task:moved', {
        task: result.task,
      });

      return result.task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_MOVE_FAILED,
        error,
        {
          workspaceId,
          taskId: id,
          reorder: true,
          requestedColumnId: reorderTaskDto.columnId,
          requestedStatus: reorderTaskDto.status,
          requestedSprintId: reorderTaskDto.sprintId,
          beforeTaskId: reorderTaskDto.beforeTaskId,
          afterTaskId: reorderTaskDto.afterTaskId,
        },
      );
      throw error;
    }
  }
}
