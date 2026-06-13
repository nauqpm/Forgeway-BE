import { TaskDocument } from '../schemas/task.schema';

export interface TaskLookupOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface MoveTaskData {
  columnId?: string;
  status?: string;
  sprintId?: string | null;
  rank?: string;
}

export interface TaskRankScope {
  workspaceId: string;
  columnId?: string;
  sprintId?: string | null;
}

export interface TaskPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | string;
}

export interface TaskPaginatedResult {
  tasks: TaskDocument[];
  total: number;
  page: number;
  limit: number;
}
