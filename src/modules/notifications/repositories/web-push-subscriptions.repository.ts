import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async removeForUser(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionModel
      .deleteOne({ userId: new Types.ObjectId(userId), endpoint })
      .exec();
  }

  async findForUser(userId: string): Promise<WebPushSubscriptionDocument[]> {
    return this.subscriptionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();
  }
}
