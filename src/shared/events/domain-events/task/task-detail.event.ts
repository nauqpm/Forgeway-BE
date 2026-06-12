import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import {
  TaskActivityCreatedEventData,
  TaskAttachmentAddedEventData,
  TaskAttachmentDeletedEventData,
  TaskCommentCreatedEventData,
  TaskCommentDeletedEventData,
  TaskCommentUpdatedEventData,
  TaskCoverUpdatedEventData,
  TaskLabelsUpdatedEventData,
} from './task-event-payloads';

export class TaskCommentCreatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_COMMENT_CREATED,
  TaskCommentCreatedEventData
> {
  constructor(data: TaskCommentCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_COMMENT_CREATED, data);
  }
}

export class TaskCommentUpdatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_COMMENT_UPDATED,
  TaskCommentUpdatedEventData
> {
  constructor(data: TaskCommentUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_COMMENT_UPDATED, data);
  }
}

export class TaskCommentDeletedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_COMMENT_DELETED,
  TaskCommentDeletedEventData
> {
  constructor(data: TaskCommentDeletedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_COMMENT_DELETED, data);
  }
}

export class TaskAttachmentAddedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_ATTACHMENT_ADDED,
  TaskAttachmentAddedEventData
> {
  constructor(data: TaskAttachmentAddedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_ATTACHMENT_ADDED, data);
  }
}

export class TaskAttachmentDeletedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_ATTACHMENT_DELETED,
  TaskAttachmentDeletedEventData
> {
  constructor(data: TaskAttachmentDeletedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_ATTACHMENT_DELETED, data);
  }
}

export class TaskLabelsUpdatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_LABELS_UPDATED,
  TaskLabelsUpdatedEventData
> {
  constructor(data: TaskLabelsUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_LABELS_UPDATED, data);
  }
}

export class TaskCoverUpdatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_COVER_UPDATED,
  TaskCoverUpdatedEventData
> {
  constructor(data: TaskCoverUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_COVER_UPDATED, data);
  }
}

export class TaskActivityCreatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_ACTIVITY_CREATED,
  TaskActivityCreatedEventData
> {
  constructor(data: TaskActivityCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_ACTIVITY_CREATED, data);
  }
}
