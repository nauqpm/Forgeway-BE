import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

describe('WebPushSubscriptionsService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const subscription = {
    endpoint: 'https://push.example.test/subscription',
    expirationTime: null,
    keys: { p256dh: 'public_key', auth: 'auth_key' },
  };

  it('upserts a subscription for the authenticated user', async () => {
    const repository = { upsertForUser: jest.fn() };
    const service = new WebPushSubscriptionsService(repository as never);

    await service.upsertForUser(userId, subscription);

    expect(repository.upsertForUser).toHaveBeenCalledWith(userId, subscription);
  });

  it("removes only the authenticated user's matching endpoint", async () => {
    const repository = { removeForUser: jest.fn() };
    const service = new WebPushSubscriptionsService(repository as never);

    await service.removeForUser(userId, subscription.endpoint);

    expect(repository.removeForUser).toHaveBeenCalledWith(
      userId,
      subscription.endpoint,
    );
  });
});
