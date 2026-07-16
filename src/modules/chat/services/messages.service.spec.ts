import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessagesService } from './messages.service';

describe('MessagesService channel authorization', () => {
  const messageId = new Types.ObjectId().toString();
  const channelId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  const makeService = (hasAccess: boolean) => {
    const message = {
      channelId: new Types.ObjectId(channelId),
      senderId: new Types.ObjectId(userId),
      reactions: new Map(),
      save: jest.fn(),
      populate: jest.fn(),
    } as any;
    const messagesRepository = {
      findById: jest.fn().mockResolvedValue(message),
    };
    const channelsService = {
      validateUserAccess: jest.fn().mockResolvedValue(hasAccess),
    };
    const service = new MessagesService(
      messagesRepository as any,
      {} as any,
      channelsService as any,
      { getUsersByIds: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, channelsService, message };
  };

  it('denies edit, reaction, and reaction listing after channel access is removed', async () => {
    const { service, channelsService } = makeService(false);

    await expect(
      service.edit(messageId, userId, 'edited'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.toggleReaction(messageId, userId, '👍'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getReactions(messageId, userId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(channelsService.validateUserAccess).toHaveBeenCalledWith(
      channelId,
      userId,
    );
  });
});
