import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events';
import { TaskCreatedEvent } from '../../../shared/events/domain-events/task';
import { NotificationsService } from '../services/notifications.service';

@Injectable()
export class TaskNotificationListener {
  private readonly logger = new Logger(TaskNotificationListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_CREATED, { async: true })
  async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    const { actorId, task, taskId, taskKey, workspaceId } = event.data;
    const assigneeId = task.assigneeId;

    if (!actorId || !assigneeId) {
      return;
    }

    try {
      await this.notificationsService.notifyTaskAssigned({
        recipientId: assigneeId,
        actorId,
        workspaceId,
        taskId,
        taskKey,
        taskTitle: task.title,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create assignment notification for task ${taskId}: ${reason}`,
      );
    }
  }
}
