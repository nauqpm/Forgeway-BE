import { Types } from 'mongoose';
import {
  resolveMongoUri,
  runInvalidWebPushSubscriptionsCleanup,
} from './cleanup-invalid-web-push-subscriptions';

describe('runInvalidWebPushSubscriptionsCleanup', () => {
  const validEndpoint = 'https://fcm.googleapis.com/push/valid';
  const invalidEndpoint = 'https://127.0.0.1/push/invalid';
  const validId = new Types.ObjectId();
  const invalidId = new Types.ObjectId();

  function setup(argv: string[]) {
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const collection = {
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: validId,
            userId: new Types.ObjectId(),
            endpoint: validEndpoint,
            refreshVersion: 3,
          },
          {
            _id: invalidId,
            userId: new Types.ObjectId(),
            endpoint: invalidEndpoint,
            refreshVersion: 5,
          },
        ]),
      }),
      deleteMany,
    };
    const log = jest.fn();

    return { argv, collection, deleteMany, log };
  }

  it('previews invalid rows without deleting them or exposing endpoints', async () => {
    const dependencies = setup([]);

    await expect(
      runInvalidWebPushSubscriptionsCleanup({
        ...dependencies,
        environment: {
          WEB_PUSH_ALLOWED_ENDPOINT_HOSTS: 'fcm.googleapis.com',
        },
      }),
    ).resolves.toEqual({ apply: false, invalidCount: 1 });

    expect(dependencies.deleteMany).not.toHaveBeenCalled();
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(
      validEndpoint,
    );
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(
      invalidEndpoint,
    );
  });

  it('deletes only invalid IDs when explicitly applied', async () => {
    const dependencies = setup(['--apply']);

    await expect(
      runInvalidWebPushSubscriptionsCleanup({
        ...dependencies,
        environment: {
          WEB_PUSH_ALLOWED_ENDPOINT_HOSTS: 'fcm.googleapis.com',
        },
      }),
    ).resolves.toEqual({ apply: true, invalidCount: 1 });

    expect(dependencies.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [invalidId] },
    });
  });
});

describe('resolveMongoUri', () => {
  it('uses MONGODB_URI, then DATABASE_URL, then DB_CONNECTION_STRING', () => {
    expect(
      resolveMongoUri({
        MONGODB_URI: 'mongodb://primary',
        DATABASE_URL: 'mongodb://secondary',
        DB_CONNECTION_STRING: 'mongodb://fallback',
      }),
    ).toBe('mongodb://primary');
    expect(
      resolveMongoUri({
        DATABASE_URL: 'mongodb://secondary',
        DB_CONNECTION_STRING: 'mongodb://fallback',
      }),
    ).toBe('mongodb://secondary');
    expect(
      resolveMongoUri({ DB_CONNECTION_STRING: 'mongodb://fallback' }),
    ).toBe('mongodb://fallback');
  });

  it('names every accepted variable when no Mongo URI is configured', () => {
    expect(() => resolveMongoUri({})).toThrow(
      'Missing MONGODB_URI, DATABASE_URL, or DB_CONNECTION_STRING',
    );
  });
});
