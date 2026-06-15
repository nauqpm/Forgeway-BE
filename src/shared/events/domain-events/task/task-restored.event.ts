import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskRestoredEventData } from './task-event-payloads';

export class TaskRestoredEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_RESTORED,
  TaskRestoredEventData
> {
  constructor(data: TaskRestoredEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_RESTORED, data);
  }
}
