import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseTaskEvent } from './base-task.event';
import { TaskArchivedEventData } from './task-event-payloads';

export class TaskArchivedEvent extends BaseTaskEvent<
  typeof DOMAIN_EVENT_TYPES.TASK_ARCHIVED,
  TaskArchivedEventData
> {
  constructor(data: TaskArchivedEventData) {
    super(DOMAIN_EVENT_TYPES.TASK_ARCHIVED, data);
  }
}
