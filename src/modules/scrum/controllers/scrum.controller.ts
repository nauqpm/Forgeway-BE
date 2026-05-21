import { Controller, Get, Post, Put, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScrumService } from '../services/scrum.service';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Workspaces - Scrum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:key/scrum')
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

  @Post('sprints/:sprintId/start')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
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
}
