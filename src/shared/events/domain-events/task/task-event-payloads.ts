import { DomainEventMetadata } from '../domain-event.interface';

export interface TaskEventContext extends DomainEventMetadata {
  workspaceId: string;
  taskId: string;
  taskKey: string;
  actorId?: string;
  version?: number;
}

export interface TaskSummaryPayload {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  columnId?: string;
  sprintId?: string | null;
  rank?: string;
  version?: number;
  assigneeId?: string | null;
  reporterId?: string;
  isArchived?: boolean;
  isDeleted?: boolean;
  updatedAt?: Date | string;
}

export type TaskChangeValue = string | number | boolean | null | undefined;

export interface TaskFieldChange {
  field: string;
  from?: TaskChangeValue;
  to?: TaskChangeValue;
}

export interface TaskCreatedEventData extends TaskEventContext {
  task: TaskSummaryPayload;
}

export interface TaskUpdatedEventData extends TaskEventContext {
  task: TaskSummaryPayload;
  changes: TaskFieldChange[];
}

export interface TaskMovedEventData extends TaskEventContext {
  task: TaskSummaryPayload;
  fromColumnId?: string | null;
  toColumnId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromSprintId?: string | null;
  toSprintId?: string | null;
  fromRank?: string | null;
  toRank?: string | null;
}

export interface TaskReorderedEventData extends TaskMovedEventData {
  beforeTaskId?: string | null;
  afterTaskId?: string | null;
}

export interface TaskArchivedEventData extends TaskEventContext {
  task: TaskSummaryPayload;
  archivedBy: string;
  archivedAt: Date | string;
}

export interface TaskRestoredEventData extends TaskEventContext {
  task: TaskSummaryPayload;
  restoredBy: string;
}

export interface TaskDeletedEventData extends TaskEventContext {
  task: TaskSummaryPayload;
  deletedBy: string;
  deletedAt: Date | string;
}
