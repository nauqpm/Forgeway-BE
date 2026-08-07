import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class WebPushSubscriptionKeys {
  @Prop({ required: true })
  p256dh!: string;

  @Prop({ required: true })
  auth!: string;
}

@Schema({ collection: 'web_push_subscriptions', timestamps: true })
export class WebPushSubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  endpoint!: string;

  @Prop({ type: WebPushSubscriptionKeys, required: true })
  keys!: WebPushSubscriptionKeys;

  @Prop({ type: Number, default: null })
  expirationTime!: number | null;
}

export type WebPushSubscriptionDocument = HydratedDocument<WebPushSubscription>;

export const WebPushSubscriptionSchema =
  SchemaFactory.createForClass(WebPushSubscription);
WebPushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
WebPushSubscriptionSchema.index({ userId: 1, updatedAt: -1 });
