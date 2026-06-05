import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskUpdatedEventData } from './task-event-payloads';

export class TaskUpdatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_UPDATED,
  TaskUpdatedEventData
> {
  constructor(data: TaskUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_UPDATED, data);
  }
}
