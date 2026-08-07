import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { NOTIFICATION_TYPE_VALUES } from '../constants/notification.constants';
import { WebPushService } from './web-push.service';

jest.mock('web-push');

describe('WebPushService', () => {
  const recipientId = '507f1f77bcf86cd799439011';
  const subscriptions = [
    {
      endpoint: 'https://push.example.test/one',
      keys: { p256dh: 'one', auth: 'one' },
    },
    {
      endpoint: 'https://push.example.test/two',
      keys: { p256dh: 'two', auth: 'two' },
    },
  ];
  const notification = {
    id: '507f1f77bcf86cd799439012',
    recipientId,
    type: 'TASK_ASSIGNED',
    title: 'Assigned',
    message: 'Task',
    entityType: 'task',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => jest.resetAllMocks());

  it('sends every persisted notification type to each subscription', async () => {
    const service = new WebPushService(
      {
        get: jest.fn((key: string) =>
          key === 'WEB_PUSH_ENABLED' ? 'true' : 'value',
        ),
      } as unknown as ConfigService,
      {
        findForUser: jest.fn().mockResolvedValue(subscriptions),
        removeForUser: jest.fn(),
      } as never,
    );
    jest.mocked(webPush.sendNotification).mockResolvedValue({} as never);

    for (const type of NOTIFICATION_TYPE_VALUES) {
      await service.sendNotification({ ...notification, type });
    }

    expect(webPush.sendNotification).toHaveBeenCalledTimes(
      NOTIFICATION_TYPE_VALUES.length * subscriptions.length,
    );
  });

  it.each([404, 410])(
    'removes only stale endpoint on push status %s',
    async status => {
      const subscriptionsService = {
        findForUser: jest.fn().mockResolvedValue(subscriptions),
        removeForUser: jest.fn(),
      };
      const service = new WebPushService(
        {
          get: jest.fn((key: string) =>
            key === 'WEB_PUSH_ENABLED' ? 'true' : 'value',
          ),
        } as unknown as ConfigService,
        subscriptionsService as never,
      );
      jest
        .mocked(webPush.sendNotification)
        .mockRejectedValueOnce({ statusCode: status })
        .mockResolvedValueOnce({} as never);

      await expect(
        service.sendNotification(notification),
      ).resolves.toBeUndefined();

      expect(subscriptionsService.removeForUser).toHaveBeenCalledWith(
        recipientId,
        subscriptions[0].endpoint,
      );
    },
  );

  it('keeps non-stale push failures nonfatal', async () => {
    const service = new WebPushService(
      {
        get: jest.fn((key: string) =>
          key === 'WEB_PUSH_ENABLED' ? 'true' : 'value',
        ),
      } as unknown as ConfigService,
      {
        findForUser: jest.fn().mockResolvedValue([subscriptions[0]]),
        removeForUser: jest.fn(),
      } as never,
    );
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 503 });

    await expect(
      service.sendNotification(notification),
    ).resolves.toBeUndefined();
  });
});
