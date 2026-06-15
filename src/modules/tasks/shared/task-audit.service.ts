import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { FilterTaskDto } from '../dtos/requests/filter-task.dto';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import { Request as ExpressRequest } from 'express';

@Injectable()
export class TaskAuditService {
  constructor(private readonly auditLogService: AuditLogService) {}

  logSuccess(
    req: ExpressRequest,
    userId: string,
    type: (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES],
    metadata: Record<string, unknown>,
  ): void {
    this.auditLogService.logRequest(req, {
      type,
      severity: 'INFO',
      userId,
      metadata,
    });
  }

  logFailure(
    req: ExpressRequest,
    userId: string,
    type: (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES],
    error: unknown,
    metadata: Record<string, unknown>,
  ): void {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    this.auditLogService.logRequest(req, {
      type,
      severity: 'WARN',
      userId,
      metadata: {
        ...metadata,
        reason,
      },
    });
  }

  getTaskFilterAuditMetadata(
    filterDto: FilterTaskDto,
    resultCount?: number,
  ): Record<string, unknown> & { filterCount: number } {
    const filters = this.getAuditSafeTaskFilters(filterDto);
    const appliedFilters = Object.keys(filters);
    const statusFilter = filterDto.status?.length
      ? {
          values: filterDto.status,
          count: filterDto.status.length,
          multiSelect: filterDto.status.length > 1,
        }
      : undefined;

    return {
      ...(resultCount !== undefined ? { resultCount } : {}),
      filterCount: appliedFilters.length,
      appliedFilters,
      filters,
      ...(statusFilter ? { statusFilter } : {}),
    };
  }

  private getAuditSafeTaskFilters(
    filterDto: FilterTaskDto,
  ): Record<string, unknown> {
    const {
      workspaceId,
      sprintId,
      boardId,
      columnId,
      assigneeId,
      reporterId,
      taskKey,
      type,
      status,
      priority,
      search,
      backlog,
      archived,
    } = filterDto;

    return {
      ...(workspaceId ? { workspaceId } : {}),
      ...(sprintId ? { sprintId } : {}),
      ...(boardId ? { boardId } : {}),
      ...(columnId ? { columnId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(reporterId ? { reporterId } : {}),
      ...(taskKey ? { taskKey } : {}),
      ...(type ? { type } : {}),
      ...(status?.length ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(search ? { hasSearch: true } : {}),
      ...(backlog !== undefined ? { backlog } : {}),
      ...(archived !== undefined ? { archived } : {}),
    };
  }
}
