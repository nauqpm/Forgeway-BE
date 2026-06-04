import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskDeletedEventData } from './task-event-payloads';

export class TaskDeletedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_DELETED,
  TaskDeletedEventData
> {
  constructor(data: TaskDeletedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_DELETED, data);
  }
}
