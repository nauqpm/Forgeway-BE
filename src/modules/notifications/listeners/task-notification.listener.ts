import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events';
import {
  TaskCreatedEvent,
  TaskMovedEvent,
  TaskReorderedEvent,
} from '../../../shared/events/domain-events/task';
import { TaskNotificationService } from '../services/task-notification.service';

@Injectable()
export class TaskNotificationListener {
  constructor(
    private readonly taskNotificationService: TaskNotificationService,
  ) {}

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_CREATED, { async: true })
  async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    await this.taskNotificationService.handleTaskCreated(event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_MOVED, { async: true })
  async handleTaskMoved(event: TaskMovedEvent): Promise<void> {
    await this.taskNotificationService.handleTaskStatusChanged(event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_REORDERED, { async: true })
  async handleTaskReordered(event: TaskReorderedEvent): Promise<void> {
    await this.taskNotificationService.handleTaskStatusChanged(event);
  }
}
