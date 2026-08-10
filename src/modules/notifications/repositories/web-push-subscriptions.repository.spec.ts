import { WebPushSubscriptionsRepository } from './web-push-subscriptions.repository';

type StoredSubscription = {
  _id: string;
  endpoint: string;
  updatedAt: Date;
};

class InMemorySubscriptionModel {
  subscriptions: StoredSubscription[] = [
    {
      _id: 'one',
      endpoint: 'https://fcm.googleapis.com/one',
      updatedAt: new Date('2026-08-10T00:00:01.000Z'),
    },
    {
      _id: 'two',
      endpoint: 'https://fcm.googleapis.com/two',
      updatedAt: new Date('2026-08-10T00:00:02.000Z'),
    },
  ];
  beforeDelete: (() => void) | undefined;
  private nextId = 3;

  findOneAndUpdate(
    filter: { endpoint: string },
    _update: unknown,
    _options: unknown,
  ) {
    return {
      exec: async () => {
        const existing = this.subscriptions.find(
          subscription => subscription.endpoint === filter.endpoint,
        );
        const current = existing ?? {
          _id: String(this.nextId++),
          endpoint: filter.endpoint,
          updatedAt: new Date(0),
        };
        current.updatedAt = new Date(
          `2026-08-10T00:00:0${this.nextId}.000Z`,
        );
        if (!existing) this.subscriptions.push(current);
        return current;
      },
    };
  }

  find() {
    let sort: Record<string, number> = {};
    return {
      sort: (value: Record<string, number>) => {
        sort = value;
        return {
          exec: async () =>
            [...this.subscriptions].sort((left, right) => {
              const updatedAtOrder = sort.updatedAt ?? 0;
              if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
                return (
                  (left.updatedAt.getTime() - right.updatedAt.getTime()) *
                  updatedAtOrder
                );
              }
              return left._id.localeCompare(right._id) * (sort._id ?? 0);
            }),
        };
      },
    };
  }

  deleteMany(
    filter:
      | { _id: { $in: string[] } }
      | { $or: Array<{ _id: string; updatedAt: Date }> },
  ) {
    return {
      exec: async () => {
        this.beforeDelete?.();
        this.subscriptions = this.subscriptions.filter(
          subscription => !this.matchesDeletionFilter(subscription, filter),
        );
      },
    };
  }

  private matchesDeletionFilter(
    subscription: StoredSubscription,
    filter:
      | { _id: { $in: string[] } }
      | { $or: Array<{ _id: string; updatedAt: Date }> },
  ): boolean {
    if ('$or' in filter) {
      return filter.$or.some(
        candidate =>
          candidate._id === subscription._id &&
          candidate.updatedAt.getTime() === subscription.updatedAt.getTime(),
      );
    }

    return filter._id.$in.includes(subscription._id);
  }
}

class InMemoryCapLockModel {
  lock: { ownerToken?: string; leaseUntil: Date } | undefined;

  findOneAndUpdate(
    _filter: unknown,
    update: { $set: { ownerToken: string; leaseUntil: Date } },
  ) {
    return {
      exec: async () => {
        if (!this.lock || this.lock.leaseUntil > new Date()) return null;
        this.lock = {
          ownerToken: update.$set.ownerToken,
          leaseUntil: update.$set.leaseUntil,
        };
        return this.lock;
      },
    };
  }

  create(input: { ownerToken: string; leaseUntil: Date }) {
    if (this.lock) {
      const error = new Error('duplicate key') as Error & { code?: number };
      error.code = 11_000;
      return Promise.reject(error);
    }
    this.lock = {
      ownerToken: input.ownerToken,
      leaseUntil: input.leaseUntil,
    };
    return Promise.resolve(this.lock);
  }

  updateOne(filter: { ownerToken: string }) {
    return {
      exec: async () => {
        if (this.lock?.ownerToken === filter.ownerToken) {
          this.lock = { leaseUntil: new Date(0) };
        }
      },
    };
  }
}

describe('WebPushSubscriptionsRepository concurrent registration cap', () => {
  it('recovers an expired lock and retains the three newest concurrent registrations', async () => {
    const model = new InMemorySubscriptionModel();
    const capLocks = new InMemoryCapLockModel();
    capLocks.lock = {
      ownerToken: 'crashed-owner',
      leaseUntil: new Date(Date.now() + 200),
    };
    const repository = new WebPushSubscriptionsRepository(
      model as never,
      capLocks as never,
    );
    const userId = '507f1f77bcf86cd799439011';
    const three = {
      endpoint: 'https://fcm.googleapis.com/three',
      expirationTime: null,
      keys: { p256dh: 'public_key', auth: 'auth_key' },
    };
    const four = {
      endpoint: 'https://fcm.googleapis.com/four',
      expirationTime: null,
      keys: { p256dh: 'public_key', auth: 'auth_key' },
    };

    await Promise.all([
      repository.upsertAndRetainLatestForUser(userId, three),
      repository.upsertAndRetainLatestForUser(userId, four),
    ]);

    expect(model.subscriptions.map(subscription => subscription.endpoint)).toEqual(
      [
        'https://fcm.googleapis.com/two',
        'https://fcm.googleapis.com/three',
        'https://fcm.googleapis.com/four',
      ],
    );
  });

  it('does not delete a stale candidate that a new owner refreshed before deletion', async () => {
    const model = new InMemorySubscriptionModel();
    model.subscriptions.push({
      _id: 'three',
      endpoint: 'https://fcm.googleapis.com/three',
      updatedAt: new Date('2026-08-10T00:00:03.000Z'),
    });
    model.beforeDelete = () => {
      const refreshed = model.subscriptions.find(
        subscription => subscription._id === 'one',
      );
      if (refreshed) {
        refreshed.updatedAt = new Date('2026-08-10T00:00:10.000Z');
      }
    };
    const repository = new WebPushSubscriptionsRepository(
      model as never,
      new InMemoryCapLockModel() as never,
    );

    await repository.upsertAndRetainLatestForUser(
      '507f1f77bcf86cd799439011',
      {
        endpoint: 'https://fcm.googleapis.com/four',
        expirationTime: null,
        keys: { p256dh: 'public_key', auth: 'auth_key' },
      },
    );

    expect(model.subscriptions.map(subscription => subscription.endpoint)).toContain(
      'https://fcm.googleapis.com/one',
    );
  });
});
