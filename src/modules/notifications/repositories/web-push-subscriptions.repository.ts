import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WEB_PUSH_DELIVERY_POLICY } from '../config/web-push.config';
import { PushSubscriptionInput } from '../dtos/web-push-subscription.dto';
import {
  WebPushSubscription,
  WebPushSubscriptionDocument,
} from '../schemas/web-push-subscription.schema';

@Injectable()
export class WebPushSubscriptionsRepository {
  constructor(
    @InjectModel(WebPushSubscription.name)
    private readonly subscriptionModel: Model<WebPushSubscriptionDocument>,
  ) {}

  async upsertForUser(
    userId: string,
    input: PushSubscriptionInput,
  ): Promise<void> {
    await this.subscriptionModel
      .findOneAndUpdate(
        { endpoint: input.endpoint },
        {
          $set: {
            userId: new Types.ObjectId(userId),
            keys: input.keys,
            expirationTime: input.expirationTime ?? null,
            failureCount: 0,
            lastFailureAt: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
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

  async findAllForUser(
    userId: string,
  ): Promise<WebPushSubscriptionDocument[]> {
    return this.subscriptionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1, _id: -1 })
      .exec();
  }

  async deleteLeastRecentlyUpdatedForUser(
    userId: string,
    count: number,
  ): Promise<void> {
    if (count <= 0) return;

    const scopedUserId = new Types.ObjectId(userId);
    const subscriptions = await this.subscriptionModel
      .find({ userId: scopedUserId })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(count)
      .select({ _id: 1 })
      .lean()
      .exec();
    if (!subscriptions.length) return;

    await this.subscriptionModel
      .deleteMany({
        userId: scopedUserId,
        _id: { $in: subscriptions.map(subscription => subscription._id) },
      })
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
}
