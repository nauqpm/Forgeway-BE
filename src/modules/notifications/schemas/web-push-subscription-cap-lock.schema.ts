import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'web_push_subscription_cap_locks' })
export class WebPushSubscriptionCapLock {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: false })
  ownerToken?: string;

  @Prop({ type: Date, required: true })
  leaseUntil!: Date;
}

export const WebPushSubscriptionCapLockSchema =
  SchemaFactory.createForClass(WebPushSubscriptionCapLock);
WebPushSubscriptionCapLockSchema.index({ userId: 1 }, { unique: true });
