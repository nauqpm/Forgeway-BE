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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { DeleteTaskDto } from '../dtos/requests/delete-task.dto';
import { FilterTaskDto } from '../dtos/requests/filter-task.dto';
import { MoveTaskDto } from '../dtos/requests/move-task.dto';
import { UpdateTaskDto } from '../dtos/requests/update-task.dto';
import { TaskDetailDto } from '../dtos/responses/task-detail.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskDetailService } from '../services/task-detail.service';
import { TaskMoveService } from '../services/task-move.service';
import { TasksService } from '../services/tasks.service';
import { Request as ExpressRequest } from 'express';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:key/board')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskDetailService: TaskDetailService,
    private readonly taskMoveService: TaskMoveService,
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
  @ApiOperation({ summary: 'Get task detail by generated task key' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDetailDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findByTaskKey(
    @Param('key') key: string,
    @Param('taskKey') taskKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDetailDto> {
    try {
      const task = await this.taskDetailService.getDetailByKeyInWorkspaceKey(
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
          viewedFrom: 'key',
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

  @Get('backlog')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List Scrum backlog tasks without sprint assignment' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findBacklogByWorkspaceKey(
    @Param('key') key: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findBacklogByWorkspaceKey(
        key,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          queryScope: 'scrum_backlog',
          resultCount: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_LIST_VIEWED, error, {
        workspaceKey: key,
        queryScope: 'scrum_backlog',
      });
      throw error;
    }
  }

  @Get('active-sprint/tasks')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List tasks on the active Scrum sprint board' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findActiveSprintBoardByWorkspaceKey(
    @Param('key') key: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findActiveSprintBoardByWorkspaceKey(
        key,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          queryScope: 'scrum_active_sprint_board',
          resultCount: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_LIST_VIEWED, error, {
        workspaceKey: key,
        queryScope: 'scrum_active_sprint_board',
      });
      throw error;
    }
  }

  @Get('sprints/:sprintId/tasks')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List tasks in a specific Scrum sprint' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Sprint not found' })
  async findTasksBySprintInWorkspaceKey(
    @Param('key') key: string,
    @Param('sprintId') sprintId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findTasksBySprintInWorkspaceKey(
        key,
        sprintId,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          sprintId,
          queryScope: 'scrum_sprint_tasks',
          resultCount: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_LIST_VIEWED, error, {
        workspaceKey: key,
        sprintId,
        queryScope: 'scrum_sprint_tasks',
      });
      throw error;
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task detail by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findById(
    @Param('key') key: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDetailDto> {
    try {
      const task = await this.taskDetailService.getDetailByIdInWorkspaceKey(
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
          viewedFrom: 'id',
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

  @Patch(':id/move')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Move task/card across board columns or Scrum sprint scopes' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Invalid task move payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task move denied' })
  @ApiNotFoundResponse({ description: 'Task or sprint not found' })
  async move(
    @Param('key') key: string,
    @Param('id') id: string,
    @Body() moveTaskDto: MoveTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto> {
    try {
      const result = await this.taskMoveService.moveInWorkspaceKey(
        key,
        id,
        moveTaskDto,
        user.userId,
      );

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_MOVE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceKey: key,
          ...result.auditMetadata,
        },
      });

      return result.task;
    } catch (error) {
      this.auditTaskFailure(req, user.userId, SECURITY_EVENT_TYPES.TASK_MOVE_FAILED, error, {
        workspaceKey: key,
        taskId: id,
        requestedColumnId: moveTaskDto.columnId,
        requestedStatus: moveTaskDto.status,
        requestedSprintId: moveTaskDto.sprintId,
        requestedRank: moveTaskDto.rank,
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

  private getAuditSafeTaskFilters(filterDto: FilterTaskDto): Record<string, unknown> {
    const {
      workspaceId,
      sprintId,
      boardId,
      columnId,
      assigneeId,
      reporterId,
      taskKey,
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
      ...(taskKey ? { taskKey } : {}),
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
