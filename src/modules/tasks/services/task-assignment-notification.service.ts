import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { NotificationsService } from '../../notifications/services/notifications.service';

@Injectable()
export class TaskAssignmentNotificationService {
  private readonly logger = new Logger(TaskAssignmentNotificationService.name);

  constructor(
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async notifyAssigneeChanged(
    previousTask: any,
    updatedTask: any,
    actorId: string,
    workspaceId: string,
  ): Promise<void> {
    const previousAssigneeId = this.toId(previousTask.assigneeId);
    const nextAssigneeId = this.toId(updatedTask.assigneeId);

    if (!nextAssigneeId || nextAssigneeId === previousAssigneeId) {
      return;
    }

    try {
      await this.notificationsService.notifyTaskAssigned({
        recipientId: nextAssigneeId,
        actorId,
        workspaceId,
        taskId: updatedTask._id.toString(),
        taskKey: updatedTask.key,
        taskTitle: updatedTask.title,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create task assigned notification: ${message}`,
      );
    }
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }
}
