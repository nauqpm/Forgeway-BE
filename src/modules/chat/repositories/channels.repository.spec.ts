import { Types } from 'mongoose';

import { ChannelsRepository } from './channels.repository';

describe('ChannelsRepository', () => {
  it('atomically adds each member only when the user id is absent', async () => {
    const channelId = new Types.ObjectId().toString();
    const firstUserId = new Types.ObjectId();
    const duplicateUserId = new Types.ObjectId();
    const channel = { _id: new Types.ObjectId(channelId) };
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(channel) })
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
    const model = {
      findOneAndUpdate,
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(channel),
      }),
    };
    const repository = new ChannelsRepository(model as never);
    const now = new Date();

    const result = await repository.addMembersIfAbsent(channelId, [
      {
        userId: firstUserId,
        role: 'channel_member',
        joinedAt: now,
        joined: true,
      },
      {
        userId: duplicateUserId,
        role: 'channel_member',
        joinedAt: now,
        joined: true,
      },
    ]);

    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      {
        _id: new Types.ObjectId(channelId),
        'channelMembers.userId': { $ne: firstUserId },
      },
      {
        $addToSet: {
          channelMembers: expect.objectContaining({ userId: firstUserId }),
        },
      },
      { new: true },
    );
    expect(result).toEqual({
      channel,
      addedUserIds: [firstUserId.toString()],
    });
  });
});
