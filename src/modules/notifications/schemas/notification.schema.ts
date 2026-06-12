import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  NOTIFICATION_ENTITY_TYPE_VALUES,
  NOTIFICATION_TYPE_VALUES,
  NotificationEntityType,
  NotificationType,
} from '../constants/notification.constants';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace' })
  workspaceId?: Types.ObjectId;

  @Prop({ required: true, type: String, enum: NOTIFICATION_TYPE_VALUES })
  type!: NotificationType;

  @Prop({ required: true })
  title!: string;

  @Prop()
  message?: string;

  @Prop({ required: true, type: String, enum: NOTIFICATION_ENTITY_TYPE_VALUES })
  entityType!: NotificationEntityType;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop()
  readAt?: Date;

  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown>;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ workspaceId: 1, createdAt: -1 });
