import { ChatGateway } from './chat.gateway';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';

describe('ChatGateway typing authorization', () => {
  const channelId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';

  it('does not broadcast typing when current channel access is denied', async () => {
    const channelsService = {
      validateUserAccess: jest.fn().mockResolvedValue(false),
    };
    const gateway = new ChatGateway(
      {} as any,
      channelsService as any,
      {} as any,
    );
    const emit = jest.fn();
    const client = {
      data: { user: { userId } },
      to: jest.fn().mockReturnValue({ emit }),
    } as any;

    await expect(gateway.handleTyping(client, { channelId })).resolves.toEqual({
      ok: false,
    });
    expect(channelsService.validateUserAccess).toHaveBeenCalledWith(
      channelId,
      userId,
    );
    expect(emit).not.toHaveBeenCalledWith(
      REALTIME_EVENT_TYPES.CHAT_USER_TYPING,
      expect.anything(),
    );
  });

  it('broadcasts an edit to the persisted message channel, not the client payload channel', async () => {
    const persistedChannelId = '507f1f77bcf86cd799439013';
    const payloadChannelId = '507f1f77bcf86cd799439014';
    const messagesService = {
      edit: jest.fn().mockResolvedValue({ channelId: persistedChannelId }),
      updateChannelLastMessageIfNeeded: jest.fn(),
    };
    const gateway = new ChatGateway(
      {} as any,
      {} as any,
      messagesService as any,
    );
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to };

    await gateway.handleEdit({ data: { user: { userId } } } as any, {
      messageId: 'message-id',
      channelId: payloadChannelId,
      content: 'edited',
    });

    expect(
      messagesService.updateChannelLastMessageIfNeeded,
    ).toHaveBeenCalledWith(persistedChannelId, expect.anything());
    expect(to).toHaveBeenCalledWith(RoomBuilder.channel(persistedChannelId));
  });
});
