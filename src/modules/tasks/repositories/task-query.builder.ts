import { Injectable } from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
import { FilterTaskDto } from '../dtos/requests/filter-task.dto';
import { TaskDocument } from '../schemas/task.schema';
import { TaskSearchService } from '../services/task-search.service';
import { normalizeTaskKey } from '../utils/task-key.util';
import {
  TaskLookupOptions,
  TaskPaginationOptions,
  TaskRankScope,
} from './task-repository.types';

const TASK_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'key',
  'priority',
  'status',
  'rank',
  'archivedAt',
  'dueDate',
]);

@Injectable()
export class TaskQueryBuilder {
  constructor(private readonly taskSearchService: TaskSearchService) {}

  applyRelations(query: any) {
    return query
      .populate('workspaceId', 'key name type')
      .populate('assigneeId', 'fullName email avatar')
      .populate('reporterId', 'fullName email avatar')
      .populate('archivedBy', 'fullName email avatar')
      .populate('sprintId', 'name startDate endDate')
      .populate('boardId', 'name')
      .populate('labelIds', 'name');
  }

  buildVersionedSetUpdate(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      $set: data,
      $inc: { version: 1 },
    };
  }

  normalizePagination(options: TaskPaginationOptions): {
    page: number;
    limit: number;
    skip: number;
  } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
  }

  buildSort(
    options: TaskPaginationOptions,
    defaultSort: Record<string, 1 | -1>,
  ): Record<string, 1 | -1> {
    const sortBy =
      options.sortBy && TASK_SORT_FIELDS.has(options.sortBy)
        ? options.sortBy
        : undefined;
    const direction = options.sortOrder === 'asc' ? 1 : -1;

    if (!sortBy) {
      return defaultSort;
    }

    return { [sortBy]: direction, _id: direction };
  }

  buildFilter(filterDto: FilterTaskDto): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = filterDto.archived
      ? { isArchived: true, isDeleted: { $ne: true } }
      : this.buildVisibilityFilter();

    if (filterDto.workspaceId) {
      filter.workspaceId = new Types.ObjectId(filterDto.workspaceId);
    }

    if (filterDto.backlog) {
      filter.$or = [{ sprintId: null }, { sprintId: { $exists: false } }];
    } else if (filterDto.sprintId) {
      filter.sprintId = new Types.ObjectId(filterDto.sprintId);
    }
    if (filterDto.boardId) {
      filter.boardId = new Types.ObjectId(filterDto.boardId);
    }
    if (filterDto.columnId) {
      filter.columnId = filterDto.columnId;
    }
    if (filterDto.assigneeId) {
      filter.assigneeId = new Types.ObjectId(filterDto.assigneeId);
    }
    if (filterDto.reporterId) {
      filter.reporterId = new Types.ObjectId(filterDto.reporterId);
    }
    if (filterDto.labelIds?.length) {
      filter.labelIds = {
        $all: filterDto.labelIds.map(labelId => new Types.ObjectId(labelId)),
      };
    }
    if (filterDto.taskKey) {
      filter.key = normalizeTaskKey(filterDto.taskKey);
      return filter;
    }
    if (filterDto.type) {
      filter.type = filterDto.type;
    }
    if (filterDto.priority) {
      filter.priority = filterDto.priority;
    }
    if (filterDto.status?.length) {
      filter.status = { $in: filterDto.status };
    }
    if (filterDto.search) {
      Object.assign(
        filter,
        this.taskSearchService.buildSearchFilter(filterDto.search),
      );
    }

    return filter;
  }

  buildVisibilityFilter(
    options: TaskLookupOptions = {},
  ): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {};

    if (!options.includeArchived) {
      filter.isArchived = { $ne: true };
    }
    if (!options.includeDeleted) {
      filter.isDeleted = { $ne: true };
    }

    return filter;
  }

  buildRankScopeFilter(scope: TaskRankScope): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {
      workspaceId: new Types.ObjectId(scope.workspaceId),
      ...this.buildVisibilityFilter(),
    };

    if (scope.columnId) {
      filter.columnId = scope.columnId;
    }

    if (scope.sprintId === null) {
      filter.$or = [{ sprintId: null }, { sprintId: { $exists: false } }];
    } else if (scope.sprintId) {
      filter.sprintId = new Types.ObjectId(scope.sprintId);
    }

    return filter;
  }
}
