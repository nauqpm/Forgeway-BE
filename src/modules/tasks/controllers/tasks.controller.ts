import {
  Body,
  Controller,
  Delete,
  Get,
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
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { DeleteTaskDto } from '../dtos/requests/delete-task.dto';
import { UpdateTaskDto } from '../dtos/requests/update-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TasksService } from '../services/tasks.service';
import { Request as ExpressRequest } from 'express';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:key/board')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List tasks in a workspace board by workspace key' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiBadRequestResponse({ description: 'Invalid workspace key' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findByWorkspaceKey(
    @Param('key') key: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findByWorkspaceKey(key, user.userId);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          count: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_LIST_VIEWED, error, {
        workspaceKey: key,
      });
      throw error;
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create task/card in a workspace board column' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  async create(
    @Param('key') key: string,
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.createInWorkspaceKey(
        key,
        createTaskDto,
        user.userId,
      );

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_CREATE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
          type: task.type,
          priority: task.priority,
          status: task.status,
          columnId: task.columnId,
          sprintId: task.sprintId,
        },
      });

      return task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_CREATE_FAILED, error, {
        workspaceKey: key,
        requestedType: createTaskDto.type,
        requestedStatus: createTaskDto.status,
        requestedColumnId: createTaskDto.columnId,
        requestedSprintId: createTaskDto.sprintId,
      });
      throw error;
    }
  }

  @Get('key/:taskKey')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task by generated task key' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findByTaskKey(
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.findByKeyInWorkspaceKey(
        key,
        taskKey,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_VIEWED, error, {
        workspaceKey: key,
        taskKey,
      });
      throw error;
    }
  }

  @Get('archives')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List archived tasks in a workspace board' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findArchivedByWorkspaceKey(
    @Param('key') key: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findArchivedByWorkspaceKey(key, user.userId);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          archived: true,
          count: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_LIST_VIEWED, error, {
        workspaceKey: key,
        archived: true,
      });
      throw error;
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findById(
    @Param('key') key: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.findByIdInWorkspaceKey(
        key,
        id,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_VIEWED, error, {
        workspaceKey: key,
        taskId: id,
      });
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task update payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task update denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async update(
    @Param('key') key: string,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.updateInWorkspaceKey(
        key,
        id,
        updateTaskDto,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_UPDATE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
          status: task.status,
          columnId: task.columnId,
          changedFields: Object.keys(updateTaskDto),
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_UPDATE_FAILED, error, {
        workspaceKey: key,
        taskId: id,
        changedFields: Object.keys(updateTaskDto),
      });
      throw error;
    }
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Archive task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async archive(
    @Param('key') key: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.archiveInWorkspaceKey(key, id, user.userId);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_ARCHIVE_SUCCESS,
        severity: 'WARN',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_ARCHIVE_FAILED, error, {
        workspaceKey: key,
        taskId: id,
      });
      throw error;
    }
  }

  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Restore archived task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  @ApiNotFoundResponse({ description: 'Archived task not found' })
  async restore(
    @Param('key') key: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.restoreInWorkspaceKey(key, id, user.userId);
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_RESTORE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_RESTORE_FAILED, error, {
        workspaceKey: key,
        taskId: id,
      });
      throw error;
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete task/card' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace admin role required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async delete(
    @Param('key') key: string,
    @Param('id') id: string,
    @Body() deleteTaskDto: DeleteTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<void> {
    try {
      const task = await this.tasksService.deletePermanentlyInWorkspaceKey(
        key,
        id,
        user.userId,
        deleteTaskDto.confirmText,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_SUCCESS,
        severity: 'WARN',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: id,
          taskKey: task.key,
        },
      });
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_FAILED, error, {
        workspaceKey: key,
        taskId: id,
      });
      throw error;
    }
  }

  private auditTaskFailure(
    req: ExpressRequest,
    userId: string,
    type: (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES],
    error: unknown,
    metadata: Record<string, unknown>,
  ): void {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    this.auditLogService.logRequest(req, {
      type,
      severity: 'WARN',
      userId,
      metadata: {
        ...metadata,
        reason,
      },
    });
  }
}
