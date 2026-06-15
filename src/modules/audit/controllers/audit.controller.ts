import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuditLogService } from '../services/audit-log.service';
import { AuditQueryOptions } from '../services/audit-log.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

@ApiTags('Audit Logs')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GLOBAL_ROLES.SUPER_ADMIN)
@ApiBearerAuth()
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('logs')
  @ApiOperation({
    summary: 'Super admin only: query audit/activity logs with filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of audit events',
    schema: {
      example: {
        data: [
          {
            _id: '...',
            type: 'LOGIN_SUCCESS',
            severity: 'INFO',
            userId: '...',
            email: 'user@example.com',
            ip: '::1',
            userAgent: 'Mozilla/5.0...',
            metadata: {},
            createdAt: '2026-06-05T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
      },
    },
  })
  async queryLogs(
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('ip') ip?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const options: AuditQueryOptions = {
      userId,
      type,
      severity,
      ip,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    };

    this.logger.log(`[Audit] Query logs: ${JSON.stringify(options)}`);
    return this.auditLogService.queryLogs(options);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Super admin only: get audit log statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics about audit events',
    schema: {
      example: {
        total: 1000,
        bySeverity: { INFO: 800, WARN: 180, CRITICAL: 20 },
        byType: {
          LOGIN_SUCCESS: 500,
          TASK_VIEWED: 200,
          UNAUTHORIZED_ACCESS: 50,
        },
        recentCount: 42,
      },
    },
  })
  async getStats() {
    this.logger.log('[Audit] Getting stats');
    return this.auditLogService.getStats();
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'Super admin only: get a single audit log entry' })
  @ApiResponse({ status: 200, description: 'Single audit log entry' })
  @ApiResponse({ status: 404, description: 'Log entry not found' })
  async getLogById(@Param('id') id: string) {
    const log = await this.auditLogService.getLogById(id);
    if (!log) {
      return null;
    }
    return log;
  }
}
