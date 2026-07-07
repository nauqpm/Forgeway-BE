import {
  Controller,
  Get,
  HttpStatus,
  Param,
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { WorklogReportQueryDto } from '../dtos/requests/worklog-report-query.dto';
import { WorklogReportDto } from '../dtos/responses/worklog-report.dto';
import { WorkLogsQueryService } from '../services/work-logs-query.service';

@ApiTags('Workspace Work Log Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:workspaceId/reports/worklogs')
export class WorkLogReportsController {
  constructor(private readonly workLogsQueryService: WorkLogsQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Get work log report for a workspace' })
  @ApiResponse({ status: HttpStatus.OK, type: WorklogReportDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Workspace membership/permissions required',
  })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  async getWorklogReport(
    @Param('workspaceId') workspaceId: string,
    @Query() query: WorklogReportQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WorklogReportDto> {
    return this.workLogsQueryService.getReport(workspaceId, user.userId, query);
  }
}
