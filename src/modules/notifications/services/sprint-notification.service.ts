import { Injectable, Logger } from '@nestjs/common';

import {
  SprintCompletedEvent,
  SprintStartedEvent,
} from '../../../shared/events/domain-events/sprint';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class SprintNotificationService {
  private readonly logger = new Logger(SprintNotificationService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

  private async getNotificationRecipients(
    workspaceId: string,
    actorId?: string,
  ): Promise<string[]> {
    const allMemberIds =
      await this.workspaceMemberService.getMemberIdsSet(workspaceId);
    return Array.from(allMemberIds).filter(id => id !== actorId);
  }

  async handleSprintStarted(event: SprintStartedEvent): Promise<void> {
    const { actorId, sprint, sprintId, workspaceId } = event.data;

    try {
      const recipientIds = await this.getNotificationRecipients(
        workspaceId,
        actorId,
      );

      if (!recipientIds.length) {
        return;
      }

      await this.notificationsService.notifySprintStarted({
        recipientIds,
        actorId,
        workspaceId,
        sprintId,
        sprintName: sprint.name,
        endDate:
          typeof sprint.endDate === 'string'
            ? new Date(sprint.endDate)
            : sprint.endDate,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create sprint started notifications for sprint ${sprintId}: ${reason}`,
      );
    }
  }

  async handleSprintCompleted(event: SprintCompletedEvent): Promise<void> {
    const { actorId, sprint, sprintId, workspaceId } = event.data;

    try {
      const recipientIds = await this.getNotificationRecipients(
        workspaceId,
        actorId,
      );

      if (!recipientIds.length) {
        return;
      }

      await this.notificationsService.notifySprintCompleted({
        recipientIds,
        actorId,
        workspaceId,
        sprintId,
        sprintName: sprint.name,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create sprint completed notifications for sprint ${sprintId}: ${reason}`,
      );
    }
  }
}
