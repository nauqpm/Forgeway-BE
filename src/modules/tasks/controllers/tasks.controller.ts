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
  ParseIntPipe,
  DefaultValuePipe,
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
import { MoveTaskDto } from '../dtos/requests/move-task.dto';
import { ReorderTaskDto } from '../dtos/requests/reorder-task.dto';
import { UpdateTaskDto } from '../dtos/requests/update-task.dto';
import { TaskDetailDto } from '../dtos/responses/task-detail.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskDetailService } from '../services/task-detail.service';
import { TaskMoveService } from '../services/task-move.service';
import { TaskReorderService } from '../services/task-reorder.service';
import { TasksService } from '../services/tasks.service';
import {
  TaskDependencyService,
  TaskDependencyDto,
} from '../services/task-dependency.service';
import { DependencyType } from '../schemas/task-dependency.schema';
import { Request as ExpressRequest } from 'express';
import { RealtimeService } from '@/modules/realtime/realtime.service';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskDetailService: TaskDetailService,
    private readonly taskMoveService: TaskMoveService,
    private readonly taskReorderService: TaskReorderService,
    private readonly auditLogService: AuditLogService,
    private readonly realtimeService: RealtimeService,
    private readonly taskDependencyService: TaskDependencyService,
  ) {}

  @Get('tasks')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List tasks in a workspace board by workspace ID' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskListDto })
  @ApiBadRequestResponse({ description: 'Invalid workspace ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findByWorkspaceKey(
    @Param('workspaceId') workspaceId: string,
    @Query() filterDto: FilterTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskListDto> {
    try {
      const result = await this.tasksService.findByWorkspaceId(
        workspaceId,
        user.userId,
        filterDto,
      );
      const filterMetadata = this.getTaskFilterAuditMetadata(
        filterDto,
        result.total,
      );
      this.auditLogService.logRequest(req, {
        type:
          filterMetadata.filterCount > 0
            ? SECURITY_EVENT_TYPES.TASK_FILTER_APPLIED
            : SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          ...filterMetadata,
        },
      });
      return result;
    } catch (error) {
      const filterMetadata = this.getTaskFilterAuditMetadata(filterDto);
      this.auditTaskFailure(
        req,
        user.userId,
        filterMetadata.filterCount > 0
          ? SECURITY_EVENT_TYPES.TASK_FILTER_FAILED
          : SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        error,
        {
          workspaceId,
          ...filterMetadata,
        },
      );
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

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_CREATE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          type: task.type,
          priority: task.priority,
          status: task.status,
          columnId: task.columnId,
          sprintId: task.sprintId,
        },
      });

      this.realtimeService.emitBoardDelta(workspaceId, 'task:created', {
        task,
      });

      return task;
    } catch (error) {
      this.auditTaskFailure(
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
      const task = await this.tasksService.findByKeyInWorkspaceId(
        workspaceId,
        taskKey,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          viewedFrom: 'key',
        },
      });
      this.realtimeService.emitBoardDelta(workspaceId, 'task:updated', {
        task,
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(
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

  @Get('archives')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List archived tasks in a workspace board' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskListDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findArchivedByWorkspaceKey(
    @Param('workspaceId') workspaceId: string,
    @Query() filterDto: FilterTaskDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskListDto> {
    try {
      const result = await this.tasksService.findArchivedByWorkspaceId(
        workspaceId,
        user.userId,
        filterDto,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          archived: true,
          count: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
      return result;
    } catch (error) {
      this.auditTaskFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        error,
        {
          workspaceId,
          archived: true,
        },
      );
      throw error;
    }
  }

  @Get('backlog')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'List Scrum backlog tasks without sprint assignment',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findBacklogByWorkspaceKey(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findBacklogByWorkspaceId(
        workspaceId,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          queryScope: 'scrum_backlog',
          resultCount: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        error,
        {
          workspaceId,
          queryScope: 'scrum_backlog',
        },
      );
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
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findActiveSprintBoardByWorkspaceId(
        workspaceId,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          queryScope: 'scrum_active_sprint_board',
          resultCount: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        error,
        {
          workspaceId,
          queryScope: 'scrum_active_sprint_board',
        },
      );
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
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDto[]> {
    try {
      const tasks = await this.tasksService.findTasksBySprintInWorkspaceId(
        workspaceId,
        sprintId,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          sprintId,
          queryScope: 'scrum_sprint_tasks',
          resultCount: tasks.length,
        },
      });
      return tasks;
    } catch (error) {
      this.auditTaskFailure(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        error,
        {
          workspaceId,
          sprintId,
          queryScope: 'scrum_sprint_tasks',
        },
      );
      throw error;
    }
  }

  // ─── Calendar ──────────────────────────────────────────────────────────────

  @Get('calendar')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'Get tasks for calendar view (month ± 1-week buffer)',
  })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async getCalendarTasks(
    @Param('workspaceId') workspaceId: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe)
    year: number,
    @Query(
      'month',
      new DefaultValuePipe(new Date().getMonth() + 1),
      ParseIntPipe,
    )
    month: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ tasks: TaskDto[] }> {
    return this.tasksService.findCalendarByWorkspaceId(
      workspaceId,
      year,
      month,
      user.userId,
    );
  }

  // ─── Timeline hierarchy ────────────────────────────────────────────────────

  @Get('timeline')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'Get tasks grouped as epic hierarchy for timeline view',
  })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async getTimelineHierarchy(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{
    epics: TaskDto[];
    children: TaskDto[];
    standalones: TaskDto[];
  }> {
    return this.tasksService.findTimelineHierarchyByWorkspaceId(
      workspaceId,
      user.userId,
    );
  }

  // ─── Workspace-level dependencies ─────────────────────────────────────────

  @Get('dependencies')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List all task dependencies for this workspace' })
  async getWorkspaceDependencies(
    @Param('workspaceId') workspaceId: string,
  ): Promise<TaskDependencyDto[]> {
    return this.taskDependencyService.findByWorkspace(workspaceId);
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
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: ExpressRequest,
  ): Promise<TaskDetailDto> {
    try {
      const task = await this.tasksService.findByIdInWorkspaceId(
        workspaceId,
        id,
        user.userId,
      );
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_VIEWED,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          viewedFrom: 'id',
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(
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
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_UPDATE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
          status: task.status,
          columnId: task.columnId,
          changedFields: Object.keys(updateTaskDto),
        },
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(
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

  @Patch(':id/reorder')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_MOVE)
  @ApiOperation({
    summary: 'Reorder task/card by relative neighbor tasks',
  })
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

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_MOVE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          reorder: true,
          ...result.auditMetadata,
        },
      });

      this.realtimeService.emitBoardDelta(workspaceId, 'task:moved', {
        task: result.task,
      });

      return result.task;
    } catch (error) {
      this.auditTaskFailure(
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

      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_MOVE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          ...result.auditMetadata,
        },
      });

      this.realtimeService.emitBoardDelta(workspaceId, 'task:moved', {
        task: result.task,
      });

      return result.task;
    } catch (error) {
      this.auditTaskFailure(
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
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_ARCHIVE_SUCCESS,
        severity: 'WARN',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      this.realtimeService.emitBoardDelta(workspaceId, 'task:deleted', {
        taskId: task.id,
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(
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
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_RESTORE_SUCCESS,
        severity: 'INFO',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      this.realtimeService.emitBoardDelta(workspaceId, 'task:updated', {
        task,
      });
      return task;
    } catch (error) {
      this.auditTaskFailure(
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
      this.auditLogService.logRequest(req, {
        type: SECURITY_EVENT_TYPES.TASK_DELETE_PERMANENT_SUCCESS,
        severity: 'WARN',
        userId: user.userId,
        metadata: {
          workspaceId,
          taskId: id,
          taskKey: task.key,
        },
      });
      this.realtimeService.emitBoardDelta(workspaceId, 'task:deleted', {
        taskId: task.id,
      });
    } catch (error) {
      this.auditTaskFailure(
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

  // ─── Task-level dependency CRUD ───────────────────────────────────────────

  @Get(':taskId/dependencies')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List dependencies for a specific task' })
  async getTaskDependencies(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskDependencyDto[]> {
    return this.taskDependencyService.findByTask(workspaceId, taskId);
  }

  @Post(':taskId/dependencies')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a dependency between two tasks' })
  async createDependency(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() body: { toTaskId: string; type?: DependencyType },
  ): Promise<TaskDependencyDto> {
    return this.taskDependencyService.create(
      workspaceId,
      taskId,
      body.toTaskId,
      body.type ?? 'blocks',
    );
  }

  @Delete(':taskId/dependencies/:depId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task dependency' })
  async deleteDependency(
    @Param('workspaceId') workspaceId: string,
    @Param('depId') depId: string,
  ): Promise<void> {
    return this.taskDependencyService.delete(workspaceId, depId);
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

  private getAuditSafeTaskFilters(
    filterDto: FilterTaskDto,
  ): Record<string, unknown> {
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
