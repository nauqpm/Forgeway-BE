import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ScrumService } from '../services/scrum.service';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceTypeGuard } from '../../../common/guards/workspace-type.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Workspaces - Scrum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceTypeGuard('scrum'))
@Controller('workspaces/:key')
export class ScrumController {
  constructor(
    private readonly scrumService: ScrumService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Post('sprints')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Create a new sprint' })
  async createSprint(
    @Param('key') key: string,
    @Body() dto: CreateSprintDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.createSprint(workspace._id.toString(), dto);
  }

  @Get('sprints')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get all sprints in workspace' })
  async findByWorkspace(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.findByWorkspace(workspace._id.toString());
  }

  @Patch('sprints/:sprintId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update sprint name/goal/dates (planning status only)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async updateSprint(
    @Param('key') key: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.updateSprint(workspace._id.toString(), sprintId, dto);
  }

  @Delete('sprints/:sprintId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sprint (planning status only)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async deleteSprint(
    @Param('key') key: string,
    @Param('sprintId') sprintId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    await this.scrumService.deleteSprint(workspace._id.toString(), sprintId);
  }

  @Post('sprints/:sprintId/start')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async startSprint(
    @Param('key') key: string,
    @Param('sprintId') sprintId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.startSprint(workspace._id.toString(), sprintId);
  }

  @Post('sprints/:sprintId/complete')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a sprint' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async completeSprint(
    @Param('key') key: string,
    @Param('sprintId') sprintId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.completeSprint(workspace._id.toString(), sprintId);
  }

  @Get('backlog')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace backlog' })
  async getBacklog(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.getBacklog(workspace._id.toString());
  }

  @Get('active-sprint')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get active sprint for workspace' })
  async getActiveSprint(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.getActiveSprint(workspace._id.toString());
  }
}
