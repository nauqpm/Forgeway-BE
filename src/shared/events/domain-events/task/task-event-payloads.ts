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

export interface TaskCommentRealtimePayload {
  id: string;
  content?: string;
  authorId: string;
  author?: object;
  targetType: string;
  targetId: string;
  parentId?: string;
  mentions?: string[];
  isDeleted?: boolean;
  editedAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface TaskAttachmentRealtimePayload {
  id: string;
  originalName: string;
  filename?: string;
  mimeType: string;
  size: number;
  targetType: string;
  targetId: string;
  uploadedBy: string;
  uploader?: object;
  downloadCount?: number;
  isDeleted?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface TaskCoverRealtimePayload {
  type: string;
  color?: string;
  imageUrl?: string;
  source?: string;
  updatedBy?: string;
  updatedAt?: Date | string;
}

export interface TaskActivityRealtimePayload {
  id: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  actorId: string;
  actor?: object;
  type: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date | string;
}

export interface TaskCommentCreatedEventData extends TaskEventContext {
  commentId: string;
  comment?: TaskCommentRealtimePayload;
}

export interface TaskCommentUpdatedEventData extends TaskEventContext {
  commentId: string;
  comment?: TaskCommentRealtimePayload;
}

export interface TaskCommentDeletedEventData extends TaskEventContext {
  commentId: string;
}

export interface TaskAttachmentAddedEventData extends TaskEventContext {
  attachmentId: string;
  attachment?: TaskAttachmentRealtimePayload;
}

export interface TaskAttachmentDeletedEventData extends TaskEventContext {
  attachmentId: string;
  fileName?: string;
}

export interface TaskLabelsUpdatedEventData extends TaskEventContext {
  labelIds: string[];
  task?: TaskSummaryPayload;
}

export interface TaskCoverUpdatedEventData extends TaskEventContext {
  cover: TaskCoverRealtimePayload | null;
}

export interface TaskActivityCreatedEventData extends TaskEventContext {
  activityId: string;
  activity?: TaskActivityRealtimePayload;
}
