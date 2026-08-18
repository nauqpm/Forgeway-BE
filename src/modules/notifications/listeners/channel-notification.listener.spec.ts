import { Types } from 'mongoose';

import { ChannelMembersInvitedEvent } from '../../../shared/events/domain-events/channel';
import { ChannelNotificationListener } from './channel-notification.listener';

describe('ChannelNotificationListener', () => {
  it('creates notifications from a channel invitation domain event', async () => {
    const notificationsService = { notifyChannelInvited: jest.fn() };
    const listener = new ChannelNotificationListener(
      notificationsService as never,
    );
    const event = new ChannelMembersInvitedEvent({
      recipientIds: [new Types.ObjectId().toString()],
      actorId: new Types.ObjectId().toString(),
      workspaceId: new Types.ObjectId().toString(),
      channelId: new Types.ObjectId().toString(),
      channelName: 'planning',
      isPrivate: true,
    });

    await listener.handleMembersInvited(event);

    expect(notificationsService.notifyChannelInvited).toHaveBeenCalledWith(
      event.data,
    );
  });
});
