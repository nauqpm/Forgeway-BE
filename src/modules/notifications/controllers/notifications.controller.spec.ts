import { NotificationsController } from './notifications.controller';

describe('NotificationsController push subscriptions', () => {
  const userId = '507f1f77bcf86cd799439011';
  const subscription = {
    endpoint: 'https://push.example.test/subscription',
    expirationTime: null,
    keys: { p256dh: 'public_key', auth: 'auth_key' },
  };

  it('uses the JWT user rather than a browser-supplied owner', async () => {
    const subscriptions = { upsertForUser: jest.fn() };
    const controller = new NotificationsController(
      {} as never,
      subscriptions as never,
    );

    await controller.upsertPushSubscription(
      { user: { userId } } as never,
      subscription,
    );

    expect(subscriptions.upsertForUser).toHaveBeenCalledWith(
      userId,
      subscription,
    );
  });
});
