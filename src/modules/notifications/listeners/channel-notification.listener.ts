import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events';
import { ChannelMembersInvitedEvent } from '../../../shared/events/domain-events/channel';
import { NotificationsService } from '../services/notifications.service';

@Injectable()
export class ChannelNotificationListener {
  private readonly logger = new Logger(ChannelNotificationListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(DOMAIN_EVENT_TYPES.CHANNEL_MEMBERS_INVITED, { async: true })
  async handleMembersInvited(event: ChannelMembersInvitedEvent): Promise<void> {
    try {
      const {
        recipientIds,
        actorId,
        workspaceId,
        channelId,
        channelName,
        isPrivate,
      } = event.data;

      await this.notificationsService.notifyChannelInvited({
        recipientIds,
        actorId,
        workspaceId,
        channelId,
        channelName,
        isPrivate,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create channel invitation notifications for ${event.data.channelId}: ${reason}`,
      );
    }
  }
}
