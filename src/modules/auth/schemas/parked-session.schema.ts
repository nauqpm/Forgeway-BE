import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ParkedSessionDocument = ParkedSession & Document;

@Schema({ timestamps: true, collection: 'parked_sessions' })
export class ParkedSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  accountId!: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  deviceId!: string;

  @Prop({ type: String, required: true })
  refreshTokenHash!: string;

  @Prop({ type: Date, default: () => new Date() })
  lastUsedAt!: Date;

  @Prop({ type: String })
  lastIp?: string;

  @Prop({ type: String })
  lastUserAgent?: string;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const ParkedSessionSchema = SchemaFactory.createForClass(ParkedSession);

ParkedSessionSchema.index(
  { ownerUserId: 1, accountId: 1, deviceId: 1 },
  { unique: true },
);
ParkedSessionSchema.index({ ownerUserId: 1, deviceId: 1, lastUsedAt: -1 });
