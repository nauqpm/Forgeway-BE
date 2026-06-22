import { Injectable, Logger } from '@nestjs/common';

import {
  TaskCreatedEvent,
  TaskMovedEvent,
  TaskReorderedEvent,
} from '../../../shared/events/domain-events/task';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class TaskNotificationService {
  private readonly logger = new Logger(TaskNotificationService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

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

  async handleTaskStatusChanged(
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

    const candidateIds = this.getCandidateRecipients(task, actorId);
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

  private getCandidateRecipients(
    task: { assigneeId?: string | null; reporterId?: string },
    actorId: string,
  ): string[] {
    return Array.from(new Set([task.assigneeId, task.reporterId])).filter(
      (recipientId): recipientId is string =>
        Boolean(recipientId) && recipientId !== actorId,
    );
  }
}
