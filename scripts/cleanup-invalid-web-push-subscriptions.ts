import mongoose from 'mongoose';
import {
  parseWebPushRuntimeConfig,
  type Environment,
} from '../src/modules/notifications/config/web-push.config';
import { WebPushEndpointPolicy } from '../src/modules/notifications/services/web-push-endpoint-policy.service';

type SubscriptionRow = {
  _id: mongoose.Types.ObjectId;
  userId: unknown;
  endpoint: string;
  refreshVersion: number;
};

type SubscriptionCollection = {
  find(
    filter: Record<string, never>,
    options: { projection: Record<string, 1> },
  ): { toArray(): Promise<SubscriptionRow[]> };
  deleteMany(filter: {
    _id: { $in: mongoose.Types.ObjectId[] };
  }): Promise<unknown>;
};

export type CleanupDependencies = {
  argv: string[];
  collection: SubscriptionCollection;
  environment: Environment;
  log: (value: unknown) => void;
};

export async function runInvalidWebPushSubscriptionsCleanup(
  dependencies: CleanupDependencies,
): Promise<{ apply: boolean; invalidCount: number }> {
  const runtimeConfig = parseWebPushRuntimeConfig({
    WEB_PUSH_ENABLED: 'true',
    WEB_PUSH_ALLOWED_ENDPOINT_HOSTS:
      dependencies.environment.WEB_PUSH_ALLOWED_ENDPOINT_HOSTS,
  });
  const endpointPolicy = new WebPushEndpointPolicy(runtimeConfig);
  const subscriptions = await dependencies.collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          userId: 1,
          endpoint: 1,
          refreshVersion: 1,
        },
      },
    )
    .toArray();
  const invalidSubscriptions = subscriptions.filter(
    subscription => !endpointPolicy.isAllowed(subscription.endpoint),
  );
  const invalidByProviderHost = invalidSubscriptions.reduce<
    Record<string, number>
  >((counts, subscription) => {
    const providerHost = safeProviderHost(subscription.endpoint);
    counts[providerHost] = (counts[providerHost] ?? 0) + 1;
    return counts;
  }, {});
  const apply =
    dependencies.argv.length === 1 && dependencies.argv[0] === '--apply';

  dependencies.log({
    event: 'web_push_invalid_subscription_cleanup',
    mode: apply ? 'apply' : 'preview',
    invalidCount: invalidSubscriptions.length,
    invalidByProviderHost,
  });

  if (apply && invalidSubscriptions.length) {
    await dependencies.collection.deleteMany({
      _id: { $in: invalidSubscriptions.map(subscription => subscription._id) },
    });
  }

  return { apply, invalidCount: invalidSubscriptions.length };
}

function safeProviderHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'malformed';
  }
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI ?? process.env.DATABASE_URL;
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI or DATABASE_URL');
  }

  await mongoose.connect(mongoUri);
  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connection is unavailable');

    await runInvalidWebPushSubscriptionsCleanup({
      argv: process.argv.slice(2),
      collection: database.collection<SubscriptionRow>(
        'web_push_subscriptions',
      ),
      environment: process.env,
      log: console.log,
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error('Invalid web push subscription cleanup failed');
    process.exitCode = 1;
  });
}
