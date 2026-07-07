import {
  Body,
  Controller,
  Get,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateWorkLogDto } from '../dtos/requests/create-work-log.dto';
import { WorkLogDto, WorkLogListDto } from '../dtos/responses/work-log.dto';
import { WorkLogsService } from '../services/work-logs.service';
import { WorkLogsQueryService } from '../services/work-logs-query.service';

@ApiTags('Workspace Board Task Work Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board-tasks/:taskId/work-logs')
export class WorkLogsController {
  constructor(
    private readonly workLogsService: WorkLogsService,
    private readonly workLogsQueryService: WorkLogsQueryService,
  ) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log work time for a task' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkLogDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Workspace membership/permissions required',
  })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async createWorkLog(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CreateWorkLogDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WorkLogDto> {
    return this.workLogsService.create(workspaceId, taskId, user.userId, dto);
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @ApiOperation({ summary: 'Get all work logs for a task' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkLogListDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Workspace membership/permissions required',
  })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async getWorkLogs(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ): Promise<WorkLogListDto> {
    return this.workLogsQueryService.getByTaskId(workspaceId, taskId);
  }

  @Patch(':logId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'Update a work log' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkLogDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Workspace membership/permissions required',
  })
  @ApiNotFoundResponse({ description: 'Work log not found' })
  async updateWorkLog(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('logId') logId: string,
    @Body()
    dto: import('../dtos/requests/update-work-log.dto').UpdateWorkLogDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WorkLogDto> {
    return this.workLogsService.update(
      workspaceId,
      taskId,
      logId,
      user.userId,
      dto,
    );
  }

  @Delete(':logId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a work log' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Workspace membership/permissions required',
  })
  @ApiNotFoundResponse({ description: 'Work log not found' })
  async deleteWorkLog(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('logId') logId: string,
    @Query('adjustTimeRemaining') adjustTimeRemaining: string,
    @Query('newTimeEstimated') newTimeEstimated: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.workLogsService.delete(
      workspaceId,
      taskId,
      logId,
      user.userId,
      adjustTimeRemaining === 'true',
      newTimeEstimated,
    );
  }
}
