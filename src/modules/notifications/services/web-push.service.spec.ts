import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { WebPushEndpointPolicy } from './web-push-endpoint-policy.service';
import { WebPushService } from './web-push.service';

jest.mock('web-push');

describe('WebPushService', () => {
  const recipientId = '507f1f77bcf86cd799439011';
  const subscriptions = [
    {
      endpoint: 'https://push.example.test/one',
      expirationTime: null,
      keys: { p256dh: 'one', auth: 'one' },
      refreshVersion: 4,
    },
    {
      endpoint: 'https://push.example.test/two',
      expirationTime: null,
      keys: { p256dh: 'two', auth: 'two' },
      refreshVersion: 8,
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
    pushAttempts: 0,
  };

  function setup(currentSubscriptions = subscriptions, enabled = true) {
    const subscriptionsService = {
      findForUser: jest.fn().mockResolvedValue(currentSubscriptions),
      removeForUser: jest.fn(),
      recordFailureForUser: jest.fn(),
      resetFailureForUser: jest.fn(),
    };
    const service = new WebPushService(
      {
        get: jest.fn((key: string) => {
          if (key === 'WEB_PUSH_ENABLED') return String(enabled);
          return 'value';
        }),
      } as unknown as ConfigService,
      subscriptionsService as never,
      new WebPushEndpointPolicy({
        enabled,
        allowedEndpointHosts: new Set(['push.example.test']),
      }),
    );
    return { service, subscriptionsService };
  }

  beforeEach(() => jest.resetAllMocks());

  it('returns delivered and sends the approved payload with exact provider options', async () => {
    const { service, subscriptionsService } = setup();
    jest.mocked(webPush.sendNotification).mockResolvedValue({} as never);

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'delivered',
      statusCode: null,
    });

    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webPush.sendNotification).toHaveBeenNthCalledWith(
      1,
      {
        endpoint: subscriptions[0].endpoint,
        expirationTime: null,
        keys: subscriptions[0].keys,
      },
      JSON.stringify({
        notificationId: notification.id,
        title: notification.title,
        message: notification.message,
        tag: `sdlc-platform:${notification.id}`,
      }),
      { TTL: 300, urgency: 'normal', timeout: 10_000 },
    );
    expect(subscriptionsService.resetFailureForUser).toHaveBeenCalledWith(
      recipientId,
      subscriptions[0].endpoint,
      subscriptions[0].refreshVersion,
    );
    expect(subscriptionsService.resetFailureForUser).toHaveBeenCalledWith(
      recipientId,
      subscriptions[1].endpoint,
      subscriptions[1].refreshVersion,
    );
  });

  it('returns skipped without loading subscriptions when Web Push is disabled', async () => {
    const { service, subscriptionsService } = setup(subscriptions, false);

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'skipped',
      statusCode: null,
    });

    expect(subscriptionsService.findForUser).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  it('returns skipped when the user has no current subscriptions', async () => {
    const { service } = setup([]);

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'skipped',
      statusCode: null,
    });

    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  it('removes an invalid stored subscription without dispatching it', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const invalidSubscription = {
      ...subscriptions[0],
      endpoint: 'https://127.0.0.1/push',
      refreshVersion: 12,
    };
    const { service, subscriptionsService } = setup([invalidSubscription]);

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'skipped',
      statusCode: null,
    });

    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(subscriptionsService.removeForUser).toHaveBeenCalledWith(
      recipientId,
      invalidSubscription.endpoint,
      invalidSubscription.refreshVersion,
    );
    expect(warn).toHaveBeenCalledWith({
      event: 'web_push_invalid_subscription_removed',
      notificationId: notification.id,
      providerHost: '127.0.0.1',
    });
    warn.mockRestore();
  });

  it('delivers a valid stored subscription while removing an invalid one', async () => {
    const invalidSubscription = {
      ...subscriptions[0],
      endpoint: 'https://127.0.0.1/push',
      refreshVersion: 12,
    };
    const { service, subscriptionsService } = setup([
      invalidSubscription,
      subscriptions[1],
    ]);
    jest.mocked(webPush.sendNotification).mockResolvedValue({} as never);

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'delivered',
      statusCode: null,
    });

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: subscriptions[1].endpoint }),
      expect.any(String),
      expect.any(Object),
    );
    expect(subscriptionsService.removeForUser).toHaveBeenCalledWith(
      recipientId,
      invalidSubscription.endpoint,
      invalidSubscription.refreshVersion,
    );
  });

  it('delivers a valid stored subscription when invalid cleanup rejects', async () => {
    const invalidSubscription = {
      ...subscriptions[0],
      endpoint: 'https://127.0.0.1/push',
      refreshVersion: 12,
    };
    const { service, subscriptionsService } = setup([
      invalidSubscription,
      subscriptions[1],
    ]);
    subscriptionsService.removeForUser.mockRejectedValue(
      new Error('cleanup unavailable'),
    );
    jest.mocked(webPush.sendNotification).mockResolvedValue({} as never);

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'delivered',
      statusCode: null,
    });

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: subscriptions[1].endpoint }),
      expect.any(String),
      expect.any(Object),
    );
  });

  it.each([404, 410])(
    'removes a stale status %s endpoint with its observed refresh version',
    async status => {
      const { service, subscriptionsService } = setup([subscriptions[0]]);
      jest.mocked(webPush.sendNotification).mockRejectedValue({
        statusCode: status,
      });

      await expect(service.sendToUser(notification)).resolves.toEqual({
        kind: 'skipped',
        statusCode: null,
      });

      expect(subscriptionsService.removeForUser).toHaveBeenCalledWith(
        recipientId,
        subscriptions[0].endpoint,
        subscriptions[0].refreshVersion,
      );
      expect(subscriptionsService.recordFailureForUser).not.toHaveBeenCalled();
    },
  );

  it('returns retry for a transient provider failure without incrementing terminal failures', async () => {
    const { service, subscriptionsService } = setup([subscriptions[0]]);
    jest.mocked(webPush.sendNotification).mockRejectedValue({
      statusCode: 503,
    });

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'retry',
      statusCode: 503,
    });

    expect(subscriptionsService.removeForUser).not.toHaveBeenCalled();
    expect(subscriptionsService.recordFailureForUser).not.toHaveBeenCalled();
  });

  it('records a terminal non-stale failure with the observed refresh version', async () => {
    const { service, subscriptionsService } = setup([subscriptions[0]]);
    jest.mocked(webPush.sendNotification).mockRejectedValue({
      statusCode: 400,
    });

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'failed',
      statusCode: 400,
    });

    expect(subscriptionsService.recordFailureForUser).toHaveBeenCalledWith(
      recipientId,
      subscriptions[0].endpoint,
      subscriptions[0].refreshVersion,
    );
  });

  it('returns the terminal non-stale status after a stale provider failure', async () => {
    const { service } = setup();
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 400 });

    await expect(service.sendToUser(notification)).resolves.toEqual({
      kind: 'failed',
      statusCode: 400,
    });
  });

  it('limits dispatch fanout to three subscriptions', async () => {
    const fourth = {
      ...subscriptions[0],
      endpoint: 'https://push.example.test/four',
      refreshVersion: 9,
    };
    const third = {
      ...subscriptions[0],
      endpoint: 'https://push.example.test/three',
      refreshVersion: 7,
    };
    const { service } = setup([...subscriptions, third, fourth]);
    jest.mocked(webPush.sendNotification).mockResolvedValue({} as never);

    await service.sendToUser(notification);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(3);
  });

  it('logs only the approved safe provider failure fields', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = setup([subscriptions[0]]);
    jest.mocked(webPush.sendNotification).mockRejectedValue({
      statusCode: 503,
    });

    await service.sendToUser(notification);

    expect(warn).toHaveBeenCalledWith({
      event: 'web_push_delivery_failed',
      notificationId: notification.id,
      attempt: 1,
      status: 503,
      providerHost: 'push.example.test',
    });
    warn.mockRestore();
  });
});
