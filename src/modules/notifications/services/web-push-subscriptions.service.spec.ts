import { BadRequestException } from '@nestjs/common';
import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

describe('WebPushSubscriptionsService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const subscription = {
    endpoint: 'https://push.example.test/subscription',
    expirationTime: null,
    keys: { p256dh: 'public_key', auth: 'auth_key' },
  };

  it('upserts a subscription for the authenticated user', async () => {
    const repository = {
      upsertAndRetainLatestForUser: jest.fn(),
    };
    const endpointPolicy = { assertAllowed: jest.fn() };
    const service = new WebPushSubscriptionsService(
      repository as never,
      endpointPolicy as never,
    );

    await service.upsertForUser(userId, subscription);

    expect(endpointPolicy.assertAllowed).toHaveBeenCalledWith(
      subscription.endpoint,
    );
    expect(repository.upsertAndRetainLatestForUser).toHaveBeenCalledWith(
      userId,
      subscription,
    );
  });

  it('uses the atomic cap operation for a fourth device', async () => {
    const repository = {
      upsertAndRetainLatestForUser: jest.fn(),
    };
    const service = new WebPushSubscriptionsService(
      repository as never,
      { assertAllowed: jest.fn() } as never,
    );

    await service.upsertForUser(userId, subscription);

    expect(repository.upsertAndRetainLatestForUser).toHaveBeenCalledWith(
      userId,
      subscription,
    );
  });

  it('rejects an endpoint before it can be persisted', async () => {
    const repository = {
      upsertAndRetainLatestForUser: jest.fn(),
    };
    const service = new WebPushSubscriptionsService(
      repository as never,
      {
        assertAllowed: jest.fn(() => {
          throw new BadRequestException();
        }),
      } as never,
    );

    await expect(service.upsertForUser(userId, subscription)).rejects.toThrow(
      BadRequestException,
    );

    expect(repository.upsertAndRetainLatestForUser).not.toHaveBeenCalled();
  });

  it("removes only the authenticated user's matching endpoint", async () => {
    const repository = { removeForUser: jest.fn() };
    const service = new WebPushSubscriptionsService(
      repository as never,
      {} as never,
    );

    await service.removeForUser(userId, subscription.endpoint);

    expect(repository.removeForUser).toHaveBeenCalledWith(
      userId,
      subscription.endpoint,
    );
  });

  it('removes a subscription after its third terminal failure', async () => {
    const updatedAt = new Date('2026-08-10T00:00:00.000Z');
    const repository = {
      recordFailureForUser: jest
        .fn()
        .mockResolvedValue({ failureCount: 3, updatedAt }),
      removeForUser: jest.fn(),
    };
    const service = new WebPushSubscriptionsService(
      repository as never,
      {} as never,
    );

    await service.recordFailureForUser(userId, subscription.endpoint);

    expect(repository.removeForUser).toHaveBeenCalledWith(
      userId,
      subscription.endpoint,
      updatedAt,
    );
  });

  it('keeps a subscription after two terminal failures', async () => {
    const repository = {
      recordFailureForUser: jest.fn().mockResolvedValue({ failureCount: 2 }),
      removeForUser: jest.fn(),
    };
    const service = new WebPushSubscriptionsService(
      repository as never,
      {} as never,
    );

    await service.recordFailureForUser(userId, subscription.endpoint);

    expect(repository.removeForUser).not.toHaveBeenCalled();
  });

  it('keeps a subscription when a failed delivery is stale', async () => {
    const repository = {
      recordFailureForUser: jest.fn().mockResolvedValue(null),
      removeForUser: jest.fn(),
    };
    const service = new WebPushSubscriptionsService(
      repository as never,
      {} as never,
    );

    await service.recordFailureForUser(userId, subscription.endpoint);

    expect(repository.removeForUser).not.toHaveBeenCalled();
  });

  it('resets a failure count after successful delivery', async () => {
    const repository = { resetFailureForUser: jest.fn() };
    const service = new WebPushSubscriptionsService(
      repository as never,
      {} as never,
    );

    await service.resetFailureForUser(userId, subscription.endpoint);

    expect(repository.resetFailureForUser).toHaveBeenCalledWith(
      userId,
      subscription.endpoint,
      undefined,
    );
  });
});
