import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ScrumService } from '../services/scrum.service';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceTypeGuard } from '../../../common/guards/workspace-type.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';

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
  async createSprint(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSprintDto,
  ) {
    return this.scrumService.createSprint(workspaceId, dto);
  }

  @Get('sprints')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get all sprints in workspace' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.findByWorkspace(workspaceId);
  }

  @Patch('sprints/:sprintId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @ApiOperation({ summary: 'Update sprint name/goal/dates (planning status only)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async updateSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
  ) {
    return this.scrumService.updateSprint(workspaceId, sprintId, dto);
  }

  @Delete('sprints/:sprintId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sprint (planning status only)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async deleteSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
  ) {
    await this.scrumService.deleteSprint(workspaceId, sprintId);
  }

  @Post('sprints/:sprintId/start')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async startSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.scrumService.startSprint(workspaceId, sprintId);
  }

  @Post('sprints/:sprintId/complete')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.SPRINT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a sprint' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async completeSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.scrumService.completeSprint(workspaceId, sprintId);
  }

  @Get('backlog')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace backlog' })
  async getBacklog(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.getBacklog(workspaceId);
  }

  @Get('active-sprint')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get active sprint for workspace' })
  async getActiveSprint(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.getActiveSprint(workspaceId);
  }
}
