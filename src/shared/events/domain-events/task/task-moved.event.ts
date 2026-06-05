import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskMovedEventData } from './task-event-payloads';

export class TaskMovedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_MOVED,
  TaskMovedEventData
> {
  constructor(data: TaskMovedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_MOVED, data);
  }
}
