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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { WorkspaceTypeGuard } from '../../../common/guards/workspace-type.guard';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import {
  CompleteSprintDto,
  CreateSprintDto,
  MoveTasksToSprintDto,
  StartSprintDto,
  UpdateSprintDto,
} from '../dtos/sprint.dto';
import { ScrumService } from '../services/scrum.service';

@ApiTags('Workspaces - Scrum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceTypeGuard('scrum'))
@Controller('workspaces/:workspaceId')
export class ScrumController {
  constructor(private readonly scrumService: ScrumService) {}

  @Post('sprints')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @ApiOperation({ summary: 'Create a new sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  async createSprint(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scrumService.createSprint(workspaceId, dto, user.userId);
  }

  @Get('sprints')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get all sprints in workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.findByWorkspace(workspaceId);
  }

  @Patch('sprints/:sprintId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @ApiOperation({ summary: 'Update sprint name/goal/dates' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async updateSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: UpdateSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scrumService.updateSprint(
      workspaceId,
      sprintId,
      dto,
      user.userId,
    );
  }

  @Delete('sprints/:sprintId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a planning sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async deleteSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.scrumService.deleteSprint(workspaceId, sprintId, user.userId);
  }

  @Post('sprints/:sprintId/start')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async startSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: StartSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scrumService.startSprint(
      workspaceId,
      sprintId,
      dto,
      user.userId,
    );
  }

  @Post('sprints/:sprintId/complete')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async completeSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: CompleteSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scrumService.completeSprint(
      workspaceId,
      sprintId,
      dto,
      user.userId,
    );
  }

  @Get('backlog')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace backlog' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiQuery({
    name: 'grouped',
    required: false,
    type: Boolean,
    description: 'Group backlog items by priority/status when supported',
  })
  async getBacklog(
    @Param('workspaceId') workspaceId: string,
    @Query('grouped') grouped?: string,
  ) {
    return this.scrumService.getBacklog(workspaceId, grouped === 'true');
  }

  @Get('active-sprint')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get active sprint for workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  async getActiveSprint(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.getActiveSprint(workspaceId);
  }

  @Post('sprints/:sprintId/tasks')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move tasks/issues into a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async moveTasksToSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: MoveTasksToSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scrumService.moveTasksToSprint(
      workspaceId,
      sprintId,
      dto.taskIds,
      user.role === 'super_admin',
    );
  }

  @Post('backlog/tasks')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move tasks/issues back to backlog' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  async moveTasksToBacklog(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: MoveTasksToSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scrumService.moveTasksToBacklog(
      workspaceId,
      dto.taskIds,
      user.role === 'super_admin',
    );
  }

  @Get('sprints/:sprintId/tasks')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get tasks in sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async getSprintTasks(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
  ) {
    return this.scrumService.getSprintTasks(workspaceId, sprintId);
  }

  @Get('sprints/:sprintId/complete-preview')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get sprint completion preview' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async getCompleteSprintPreview(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
  ) {
    return this.scrumService.getCompleteSprintPreview(workspaceId, sprintId);
  }

  @Get('reports/sprint-velocity')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get sprint velocity report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  async getSprintVelocityReport(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.getSprintVelocityReport(workspaceId);
  }
}
