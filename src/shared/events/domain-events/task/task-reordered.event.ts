import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskReorderedEventData } from './task-event-payloads';

export class TaskReorderedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_REORDERED,
  TaskReorderedEventData
> {
  constructor(data: TaskReorderedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_REORDERED, data);
  }
}
