import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { WEB_PUSH_DELIVERY_POLICY } from '../config/web-push.config';
import { PushSubscriptionInput } from '../dtos/web-push-subscription.dto';
import {
  WebPushSubscriptionCapLock,
} from '../schemas/web-push-subscription-cap-lock.schema';
import {
  WebPushSubscription,
  WebPushSubscriptionDocument,
} from '../schemas/web-push-subscription.schema';

const LOCK_ACQUISITION_ATTEMPTS = 100;
const LOCK_RETRY_DELAY_MS = 50;

@Injectable()
export class WebPushSubscriptionsRepository {
  constructor(
    @InjectModel(WebPushSubscription.name)
    private readonly subscriptionModel: Model<WebPushSubscriptionDocument>,
    @InjectModel(WebPushSubscriptionCapLock.name)
    private readonly capLockModel: Model<WebPushSubscriptionCapLock>,
  ) {}

  async upsertAndRetainLatestForUser(
    userId: string,
    input: PushSubscriptionInput,
  ): Promise<void> {
    const scopedUserId = new Types.ObjectId(userId);
    const ownerToken = randomUUID();
    await this.acquireCapLock(scopedUserId, ownerToken);

    try {
      await this.subscriptionModel
        .findOneAndUpdate(
          { endpoint: input.endpoint },
          {
            $set: {
              userId: scopedUserId,
              keys: input.keys,
              expirationTime: input.expirationTime ?? null,
              failureCount: 0,
              lastFailureAt: null,
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        )
        .exec();

      const subscriptions = await this.subscriptionModel
        .find({ userId: scopedUserId })
        .sort({ updatedAt: -1, _id: -1 })
        .exec();
      const staleSubscriptions = subscriptions
        .filter(subscription => subscription.endpoint !== input.endpoint)
        .slice(WEB_PUSH_DELIVERY_POLICY.maxSubscriptionsPerUser - 1);
      if (!staleSubscriptions.length) return;

      await this.subscriptionModel
        .deleteMany({
          userId: scopedUserId,
          $or: staleSubscriptions.map(subscription => ({
            _id: subscription._id,
            updatedAt: subscription.updatedAt,
          })),
        })
        .exec();
    } finally {
      await this.releaseCapLock(scopedUserId, ownerToken);
    }
  }

  private async acquireCapLock(
    userId: Types.ObjectId,
    ownerToken: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < LOCK_ACQUISITION_ATTEMPTS; attempt++) {
      const leaseUntil = new Date(Date.now() + WEB_PUSH_DELIVERY_POLICY.leaseMs);
      const acquired = await this.capLockModel
        .findOneAndUpdate(
          {
            userId,
            leaseUntil: { $lte: new Date() },
          },
          { $set: { ownerToken, leaseUntil } },
          { new: true },
        )
        .exec();
      if (acquired) return;

      try {
        await this.capLockModel.create({ userId, ownerToken, leaseUntil });
        return;
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) throw error;
      }

      if (attempt < LOCK_ACQUISITION_ATTEMPTS - 1) {
        await this.waitForLockRetry();
      }
    }

    throw new ConflictException('Push subscription registration is busy');
  }

  private async releaseCapLock(
    userId: Types.ObjectId,
    ownerToken: string,
  ): Promise<void> {
    await this.capLockModel
      .updateOne(
        { userId, ownerToken },
        {
          $set: { leaseUntil: new Date(0) },
          $unset: { ownerToken: 1 },
        },
      )
      .exec();
  }

  private async waitForLockRetry(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
  }

  async removeForUser(
    userId: string,
    endpoint: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      endpoint,
    };
    if (expectedUpdatedAt) {
      filter.updatedAt = expectedUpdatedAt;
    }

    await this.subscriptionModel
      .deleteOne(filter)
      .exec();
  }

  async findForUser(userId: string): Promise<WebPushSubscriptionDocument[]> {
    return this.subscriptionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .limit(WEB_PUSH_DELIVERY_POLICY.maxSubscriptionsPerUser)
      .exec();
  }

  async recordFailureForUser(
    userId: string,
    endpoint: string,
    expectedUpdatedAt?: Date,
  ): Promise<WebPushSubscriptionDocument | null> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      endpoint,
    };
    if (expectedUpdatedAt) {
      filter.updatedAt = expectedUpdatedAt;
    }

    return this.subscriptionModel
      .findOneAndUpdate(
        filter,
        {
          $inc: { failureCount: 1 },
          $set: { lastFailureAt: new Date() },
        },
        { new: true },
      )
      .exec();
  }

  async resetFailureForUser(
    userId: string,
    endpoint: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      endpoint,
    };
    if (expectedUpdatedAt) {
      filter.updatedAt = expectedUpdatedAt;
    }

    await this.subscriptionModel
      .updateOne(filter, {
        $set: { failureCount: 0, lastFailureAt: null },
      })
      .exec();
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11_000
    );
  }
}
