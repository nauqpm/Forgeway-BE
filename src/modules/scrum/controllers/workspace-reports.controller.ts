import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScrumService } from '../services/scrum.service';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Workspaces - Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId')
export class WorkspaceReportsController {
  constructor(private readonly scrumService: ScrumService) {}

  @Get('reports/cumulative-flow')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace cumulative flow report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days',
  })
  async getCumulativeFlowReport(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ) {
    return this.scrumService.getCumulativeFlowReport(
      workspaceId,
      days ? Number(days) : 30,
    );
  }
}
