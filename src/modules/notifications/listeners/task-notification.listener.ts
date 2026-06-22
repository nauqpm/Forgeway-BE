import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events';
import {
  TaskCreatedEvent,
  TaskMovedEvent,
  TaskReorderedEvent,
} from '../../../shared/events/domain-events/task';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { NotificationsService } from '../services/notifications.service';

@Injectable()
export class TaskNotificationListener {
  private readonly logger = new Logger(TaskNotificationListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

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

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_MOVED, { async: true })
  async handleTaskMoved(event: TaskMovedEvent): Promise<void> {
    await this.handleStatusTransition(event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_REORDERED, { async: true })
  async handleTaskReordered(event: TaskReorderedEvent): Promise<void> {
    await this.handleStatusTransition(event);
  }

  private async handleStatusTransition(
    event: TaskMovedEvent | TaskReorderedEvent,
  ): Promise<void> {
    const {
      actorId,
      fromStatus,
      task,
      taskId,
      taskKey,
      toStatus,
      workspaceId,
    } = event.data;

    if (!actorId || !fromStatus || !toStatus || fromStatus === toStatus) {
      return;
    }

    const candidateIds = Array.from(
      new Set([task.assigneeId, task.reporterId]),
    ).filter(
      (recipientId): recipientId is string =>
        Boolean(recipientId) && recipientId !== actorId,
    );
    if (!candidateIds.length) {
      return;
    }

    try {
      const recipientIds = await this.workspaceMemberService.filterMembers(
        workspaceId,
        candidateIds,
      );
      if (!recipientIds.length) {
        return;
      }

      await this.notificationsService.notifyTaskStatusChanged({
        recipientIds,
        actorId,
        workspaceId,
        taskId,
        taskKey,
        taskTitle: task.title,
        fromStatus,
        toStatus,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create status notification for task ${taskId}: ${reason}`,
      );
    }
  }
}
