import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskCreatedEventData } from './task-event-payloads';

export class TaskCreatedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_CREATED,
  TaskCreatedEventData
> {
  constructor(data: TaskCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_CREATED, data);
  }
}
