import { Controller, Get, Post, Put, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScrumService } from '../services/scrum.service';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Scrum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scrum')
export class ScrumController {
  constructor(private readonly scrumService: ScrumService) { }

  @Post(':workspaceId/sprints')
  @ApiOperation({ summary: 'Create a new sprint' })
  async createSprint(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSprintDto,
  ) {
    return this.scrumService.createSprint(workspaceId, dto);
  }

  @Get(':workspaceId/sprints')
  @ApiOperation({ summary: 'Get all sprints in workspace' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.findByWorkspace(workspaceId);
  }

  @Post(':workspaceId/sprints/:sprintId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
  async startSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.scrumService.startSprint(workspaceId, sprintId);
  }

  @Post(':workspaceId/sprints/:sprintId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a sprint' })
  async completeSprint(
    @Param('workspaceId') workspaceId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.scrumService.completeSprint(workspaceId, sprintId);
  }

  @Get(':workspaceId/backlog')
  @ApiOperation({ summary: 'Get workspace backlog' })
  async getBacklog(@Param('workspaceId') workspaceId: string) {
    return this.scrumService.getBacklog(workspaceId);
  }
}
