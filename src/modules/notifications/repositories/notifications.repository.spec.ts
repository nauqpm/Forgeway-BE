import { NotificationsRepository } from './notifications.repository';

describe('NotificationsRepository', () => {
  it('claims one due delivery with an exact lease in a single atomic update', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'notification' }),
    });
    const repository = new NotificationsRepository({ findOneAndUpdate } as never);
    const now = new Date('2026-08-10T00:00:00.000Z');
    const leaseUntil = new Date('2026-08-10T00:00:45.000Z');

    const notification = await (
      repository as unknown as {
        claimDuePushDelivery: (now: Date, leaseUntil: Date) => Promise<unknown>;
      }
    ).claimDuePushDelivery(now, leaseUntil);

    expect(notification).toEqual({ _id: 'notification' });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        pushDeliveryStatus: { $in: ['pending', 'retry'] },
        pushNextAttemptAt: { $lte: now },
        $or: [
          { pushLeaseUntil: null },
          { pushLeaseUntil: { $exists: false } },
          { pushLeaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          pushDeliveryStatus: 'processing',
          pushLeaseUntil: leaseUntil,
        },
      },
      {
        new: true,
        sort: { pushNextAttemptAt: 1, createdAt: 1 },
      },
    );
    expect(findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('$inc');
  });

  it('fences retry scheduling with the held lease before incrementing attempts', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'notification' }),
    });
    const repository = new NotificationsRepository({ findOneAndUpdate } as never);
    const heldLeaseUntil = new Date('2026-08-10T00:00:45.000Z');
    const nextAttemptAt = new Date('2026-08-10T00:01:15.000Z');

    await repository.schedulePushRetry(
      'notification',
      heldLeaseUntil,
      nextAttemptAt,
      503,
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'notification',
        pushDeliveryStatus: 'processing',
        pushLeaseUntil: heldLeaseUntil,
      },
      {
        $set: {
          pushDeliveryStatus: 'retry',
          pushNextAttemptAt: nextAttemptAt,
          pushLeaseUntil: null,
          pushLastErrorCode: 503,
        },
        $inc: { pushAttempts: 1 },
      },
      { new: true },
    );
  });
});
