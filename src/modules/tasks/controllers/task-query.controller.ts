import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { FilterTaskDto } from '../dtos/requests/filter-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TasksService } from '../services/tasks.service';
import { TaskAuditService } from '../shared/task-audit.service';
import { Request as ExpressRequest } from 'express';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class TaskQueryController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskAuditService: TaskAuditService,
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
      const filterMetadata = this.taskAuditService.getTaskFilterAuditMetadata(
        filterDto,
        result.total,
      );
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        filterMetadata.filterCount > 0
          ? SECURITY_EVENT_TYPES.TASK_FILTER_APPLIED
          : SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        { workspaceId, ...filterMetadata },
      );
      return result;
    } catch (error) {
      const filterMetadata =
        this.taskAuditService.getTaskFilterAuditMetadata(filterDto);
      this.taskAuditService.logFailure(
        req,
        user.userId,
        filterMetadata.filterCount > 0
          ? SECURITY_EVENT_TYPES.TASK_FILTER_FAILED
          : SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        error,
        { workspaceId, ...filterMetadata },
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
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        {
          workspaceId,
          archived: true,
          count: result.total,
          page: result.page,
          limit: result.limit,
        },
      );
      return result;
    } catch (error) {
      this.taskAuditService.logFailure(
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
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        {
          workspaceId,
          queryScope: 'scrum_backlog',
          resultCount: tasks.length,
        },
      );
      return tasks;
    } catch (error) {
      this.taskAuditService.logFailure(
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
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        {
          workspaceId,
          queryScope: 'scrum_active_sprint_board',
          resultCount: tasks.length,
        },
      );
      return tasks;
    } catch (error) {
      this.taskAuditService.logFailure(
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
      this.taskAuditService.logSuccess(
        req,
        user.userId,
        SECURITY_EVENT_TYPES.TASK_LIST_VIEWED,
        {
          workspaceId,
          sprintId,
          queryScope: 'scrum_sprint_tasks',
          resultCount: tasks.length,
        },
      );
      return tasks;
    } catch (error) {
      this.taskAuditService.logFailure(
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
}
