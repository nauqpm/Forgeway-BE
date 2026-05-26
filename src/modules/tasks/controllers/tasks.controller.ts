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
  Query,
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
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { DeleteTaskDto } from '../dtos/requests/delete-task.dto';
import { FilterTaskDto } from '../dtos/requests/filter-task.dto';
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

  @Get('tasks')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List tasks in a workspace board by workspace key' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiBadRequestResponse({ description: 'Invalid workspace key' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findByWorkspaceKey(
    @Param('key') key: string,
    @Query() filterDto: FilterTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findByWorkspaceKey(
        key,
        user.userId,
        filterDto,
      );
      const filterMetadata = this.getTaskFilterAuditMetadata(filterDto, tasks.length);
      this.auditLogService.logRequest(req, {
        type: filterMetadata.filterCount > 0
          ? SECURITY_EVENT_TYPES.TASK_FILTER_APPLIED
          : SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          ...filterMetadata,
        },
      });
      return tasks;
    } catch (error) {
      const filterMetadata = this.getTaskFilterAuditMetadata(filterDto);
      this.auditTaskFailure(req, user.userId, filterMetadata.filterCount > 0
        ? SECURITY_EVENT_TYPES.TASK_FILTER_FAILED
        : SECURITY_EVENT_TYPES.TASK_LIST_VIEWED, error, {
        workspaceKey: key,
        ...filterMetadata,
      });
      throw error;
    }
  }

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

  @Get('tasks/:taskKey')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task by generated task key in a workspace' })
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
      const task = await this.tasksService.findByKeyInWorkspace(
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

  @Get('key/:taskKey')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Legacy alias: get task by generated task key' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findByLegacyTaskKey(
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    return this.findByTaskKey(key, taskKey, user, req);
  }

  @Patch('tasks/:taskKey')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(
    WORKSPACE_PERMISSIONS.TASK_EDIT,
    WORKSPACE_PERMISSIONS.TASK_MOVE,
  )
  @ApiOperation({ summary: 'Update task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task update payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task update denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async update(
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.updateInWorkspaceKey(
        key,
        taskKey,
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
        taskKey,
        changedFields: Object.keys(updateTaskDto),
      });
      throw error;
    }
  }

  @Patch('tasks/:taskKey/archive')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'Archive task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async archive(
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.archiveTaskKeyInWorkspace(
        key,
        taskKey,
        user.userId,
      );
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
        taskKey,
      });
      throw error;
    }
  }

  @Patch('tasks/:taskKey/restore')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'Restore archived task/card' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  @ApiNotFoundResponse({ description: 'Archived task not found' })
  async restore(
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const task = await this.tasksService.restoreTaskKeyInWorkspace(
        key,
        taskKey,
        user.userId,
      );
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
        taskKey,
      });
      throw error;
    }
  }

  @Delete('tasks/:taskKey')
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
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @Body() deleteTaskDto: DeleteTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<void> {
    try {
      const task = await this.tasksService.deleteTaskKeyPermanentlyInWorkspace(
        key,
        taskKey,
        user.userId,
        deleteTaskDto.confirmText,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_SUCCESS,
        severity: 'WARN',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          taskId: task.id,
          taskKey: task.key,
        },
      });
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_FAILED, error, {
        workspaceKey: key,
        taskKey,
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

  private getAuditSafeTaskFilters(filterDto: FilterTaskDto): Record<string, unknown> {
    const {
      workspaceId,
      sprintId,
      boardId,
      columnId,
      assigneeId,
      reporterId,
      type,
      status,
      priority,
      search,
      backlog,
      archived,
    } = filterDto;

    return {
      ...(workspaceId ? { workspaceId } : {}),
      ...(sprintId ? { sprintId } : {}),
      ...(boardId ? { boardId } : {}),
      ...(columnId ? { columnId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(reporterId ? { reporterId } : {}),
      ...(type ? { type } : {}),
      ...(status?.length ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(search ? { hasSearch: true } : {}),
      ...(backlog !== undefined ? { backlog } : {}),
      ...(archived !== undefined ? { archived } : {}),
    };
  }

  private getTaskFilterAuditMetadata(
    filterDto: FilterTaskDto,
    resultCount?: number,
  ): Record<string, unknown> & { filterCount: number } {
    const filters = this.getAuditSafeTaskFilters(filterDto);
    const appliedFilters = Object.keys(filters);
    const statusFilter = filterDto.status?.length
      ? {
          values: filterDto.status,
          count: filterDto.status.length,
          multiSelect: filterDto.status.length > 1,
        }
      : undefined;

    return {
      ...(resultCount !== undefined ? { resultCount } : {}),
      filterCount: appliedFilters.length,
      appliedFilters,
      filters,
      ...(statusFilter ? { statusFilter } : {}),
    };
  }
}
