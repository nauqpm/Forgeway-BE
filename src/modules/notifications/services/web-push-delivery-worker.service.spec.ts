import { WEB_PUSH_DELIVERY_POLICY } from '../config/web-push.config';
import { WebPushDeliveryWorker } from './web-push-delivery-worker.service';

describe('WebPushDeliveryWorker', () => {
  const now = new Date('2026-08-10T00:15:00.000Z');
  const leaseUntil = new Date(
    now.getTime() + WEB_PUSH_DELIVERY_POLICY.leaseMs,
  );
  const notificationId = '507f1f77bcf86cd799439012';

  function notification(
    overrides: Partial<{
      _id: string;
      createdAt: Date;
      pushAttempts: number;
      pushLeaseUntil: Date;
    }> = {},
  ) {
    return {
      _id: notificationId,
      recipientId: '507f1f77bcf86cd799439011',
      type: 'TASK_ASSIGNED',
      title: 'Assigned',
      message: 'Task',
      entityType: 'task',
      createdAt: new Date('2026-08-10T00:14:00.000Z'),
      updatedAt: now,
      pushAttempts: 0,
      pushLeaseUntil: leaseUntil,
      ...overrides,
    };
  }

  function setup(
    claimed: Array<ReturnType<typeof notification>>,
    dispatchResult: {
      kind: 'delivered' | 'skipped' | 'retry' | 'failed';
      statusCode: number | null;
    } = { kind: 'delivered', statusCode: null },
  ) {
    const repository = {
      claimDuePushDelivery: jest
        .fn()
        .mockImplementation(() => Promise.resolve(claimed.shift() ?? null)),
      markPushDelivered: jest.fn(),
      markPushSkipped: jest.fn(),
      markPushFailed: jest.fn(),
      markPushExpired: jest.fn(),
      schedulePushRetry: jest.fn(),
    };
    const webPushService = {
      sendToUser: jest.fn().mockResolvedValue(dispatchResult),
    };
    return {
      repository,
      webPushService,
      worker: new WebPushDeliveryWorker(
        repository as never,
        webPushService as never,
      ),
    };
  }

  it('reclaims an expired lease after a crash and delivers with the new lease', async () => {
    const previousLease = new Date('2026-08-10T00:14:59.000Z');
    const claimed = notification({ pushLeaseUntil: previousLease });
    const { repository, webPushService, worker } = setup([claimed]);

    await worker.tick(now);

    expect(repository.claimDuePushDelivery).toHaveBeenNthCalledWith(
      1,
      now,
      leaseUntil,
    );
    expect(webPushService.sendToUser).toHaveBeenCalledWith(claimed);
    expect(repository.markPushDelivered).toHaveBeenCalledWith(
      notificationId,
      leaseUntil,
      now,
    );
  });

  it('drains every due claim until the repository is empty', async () => {
    const first = notification();
    const second = notification({ _id: '507f1f77bcf86cd799439013' });
    const { repository, webPushService, worker } = setup([first, second]);

    await worker.tick(now);

    expect(repository.claimDuePushDelivery).toHaveBeenCalledTimes(3);
    expect(webPushService.sendToUser).toHaveBeenCalledTimes(2);
  });

  it('refreshes the claim time and lease before taking the next backlog item', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const first = notification();
      const secondId = '507f1f77bcf86cd799439013';
      const second = notification({ _id: secondId });
      const elapsedNow = new Date(now.getTime() + 40_000);
      const elapsedLease = new Date(
        elapsedNow.getTime() + WEB_PUSH_DELIVERY_POLICY.leaseMs,
      );
      const { repository, webPushService, worker } = setup([first, second]);
      webPushService.sendToUser.mockImplementationOnce(async () => {
        jest.setSystemTime(elapsedNow);
        return { kind: 'delivered', statusCode: null };
      });

      await worker.tick(now);

      expect(repository.claimDuePushDelivery).toHaveBeenNthCalledWith(
        2,
        elapsedNow,
        elapsedLease,
      );
      expect(repository.markPushDelivered).toHaveBeenNthCalledWith(
        2,
        secondId,
        elapsedLease,
        elapsedNow,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks a notification skipped when no subscription can receive it', async () => {
    const claimed = notification();
    const { repository, worker } = setup([claimed], {
      kind: 'skipped',
      statusCode: null,
    });

    await worker.tick(now);

    expect(repository.markPushSkipped).toHaveBeenCalledWith(
      notificationId,
      leaseUntil,
    );
  });

  it.each([
    [0, 30_000],
    [1, 90_000],
    [2, 180_000],
    [3, 300_000],
  ])(
    'schedules the exact retry delay after provider failure %s',
    async (pushAttempts, delayMs) => {
      const claimed = notification({ pushAttempts });
      const { repository, worker } = setup([claimed], {
        kind: 'retry',
        statusCode: 503,
      });

      await worker.tick(now);

      expect(repository.schedulePushRetry).toHaveBeenCalledWith(
        notificationId,
        leaseUntil,
        new Date(now.getTime() + delayMs),
        503,
      );
    },
  );

  it('marks the fifth provider failure terminal without scheduling another retry', async () => {
    const claimed = notification({ pushAttempts: 4 });
    const { repository, worker } = setup([claimed], {
      kind: 'failed',
      statusCode: 400,
    });

    await worker.tick(now);

    expect(repository.markPushFailed).toHaveBeenCalledWith(
      notificationId,
      leaseUntil,
      400,
    );
    expect(repository.schedulePushRetry).not.toHaveBeenCalled();
  });

  it('retries a terminal provider result before the fifth attempt', async () => {
    const claimed = notification({ pushAttempts: 0 });
    const { repository, worker } = setup([claimed], {
      kind: 'failed',
      statusCode: 400,
    });

    await worker.tick(now);

    expect(repository.schedulePushRetry).toHaveBeenCalledWith(
      notificationId,
      leaseUntil,
      new Date(now.getTime() + 30_000),
      400,
    );
    expect(repository.markPushFailed).not.toHaveBeenCalled();
  });

  it('expires a notification at the fifteen-minute boundary before dispatch', async () => {
    const claimed = notification({
      createdAt: new Date(
        now.getTime() - WEB_PUSH_DELIVERY_POLICY.expiryMs,
      ),
    });
    const { repository, webPushService, worker } = setup([claimed]);

    await worker.tick(now);

    expect(webPushService.sendToUser).not.toHaveBeenCalled();
    expect(repository.markPushExpired).toHaveBeenCalledWith(
      notificationId,
      leaseUntil,
    );
  });

  it('prevents overlapping ticks in the same process', async () => {
    let resolveClaim!: (value: null) => void;
    const claim = new Promise<null>(resolve => {
      resolveClaim = resolve;
    });
    const repository = {
      claimDuePushDelivery: jest.fn().mockReturnValue(claim),
    };
    const worker = new WebPushDeliveryWorker(
      repository as never,
      { sendToUser: jest.fn() } as never,
    );

    const firstTick = worker.tick(now);
    await worker.tick(now);
    resolveClaim(null);
    await firstTick;

    expect(repository.claimDuePushDelivery).toHaveBeenCalledTimes(1);
  });

  it('runs immediately, polls every five seconds, and stops on destroy', async () => {
    jest.useFakeTimers();
    try {
      const { worker } = setup([]);
      const tick = jest.spyOn(worker, 'tick').mockResolvedValue();

      worker.onApplicationBootstrap();
      await Promise.resolve();
      expect(tick).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(WEB_PUSH_DELIVERY_POLICY.pollIntervalMs);
      await Promise.resolve();
      expect(tick).toHaveBeenCalledTimes(2);

      worker.onModuleDestroy();
      jest.advanceTimersByTime(WEB_PUSH_DELIVERY_POLICY.pollIntervalMs);
      await Promise.resolve();
      expect(tick).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
