import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { DeleteTaskDto } from '../dtos/requests/delete-task.dto';
import { UpdateTaskDto } from '../dtos/requests/update-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TasksService } from '../services/tasks.service';
import { TaskAuditService } from '../shared/task-audit.service';
import { RealtimeService } from '@/modules/realtime/realtime.service';
import { Request as ExpressRequest } from 'express';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class TaskCommandController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskAuditService: TaskAuditService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Post('tasks')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create task/card in a workspace board column' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.createInWorkspaceId(
        workspaceId,
        createTaskDto,
        user.userId,
      );

      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_CREATE_SUCCESS,
        {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          type: task.type,
          priority: task.priority,
          status: task.status,
          columnId: task.columnId,
          sprintId: task.sprintId,
        },
      );

      this.realtimeService.emitBoardDelta(workspaceId, 'task:created', {
        task,
      });

      return task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_CREATE_FAILED,
        error,
        {
          workspaceId,
          requestedType: createTaskDto.type,
          requestedStatus: createTaskDto.status,
          requestedColumnId: createTaskDto.columnId,
          requestedSprintId: createTaskDto.sprintId,
        },
      );
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'Update task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task update payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task update denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.updateInWorkspaceId(
        workspaceId,
        id,
        updateTaskDto,
        user.userId,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_UPDATE_SUCCESS,
        {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          status: task.status,
          columnId: task.columnId,
          changedFields: Object.keys(updateTaskDto),
        },
      );
      return task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_UPDATE_FAILED,
        error,
        {
          workspaceId,
          taskId: id,
          changedFields: Object.keys(updateTaskDto),
        },
      );
      throw error;
    }
  }

  @Patch(':id/archive')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'Archive task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.archiveInWorkspaceId(
        workspaceId,
        id,
        user.userId,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_ARCHIVE_SUCCESS,
        {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
        },
      );
      this.realtimeService.emitBoardDelta(workspaceId, 'task:deleted', {
        taskId: task.id,
      });
      return task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_ARCHIVE_FAILED,
        error,
        {
          workspaceId,
          taskId: id,
        },
      );
      throw error;
    }
  }

  @Patch(':id/restore')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'Restore archived task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  @ApiNotFoundResponse({ description: 'Archived task not found' })
  async restore(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.restoreInWorkspaceId(
        workspaceId,
        id,
        user.userId,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_RESTORE_SUCCESS,
        {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
        },
      );
      this.realtimeService.emitBoardDelta(workspaceId, 'task:updated', {
        task,
      });
      return task;
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_RESTORE_FAILED,
        error,
        {
          workspaceId,
          taskId: id,
        },
      );
      throw error;
    }
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete task/card' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace admin role required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() deleteTaskDto: DeleteTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<void> {
    try {
      const task = await this.tasksService.deletePermanentlyInWorkspaceId(
        workspaceId,
        id,
        user.userId,
        deleteTaskDto.confirmText,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_SUCCESS,
        {
          workspaceId,
          taskId: id,
          taskKey: task.key,
        },
      );
      this.realtimeService.emitBoardDelta(workspaceId, 'task:deleted', {
        taskId: task.id,
      });
    } catch (error) {
      this.taskAuditService.logFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_FAILED,
        error,
        {
          workspaceId,
          taskId: id,
        },
      );
      throw error;
    }
  }
}
