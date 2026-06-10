import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelReadMarkerDocument = ChannelReadMarker & Document;

@Schema({ timestamps: true })
export class ChannelReadMarker {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  lastReadAt!: Date;

  readonly _id!: Types.ObjectId;
}

export const ChannelReadMarkerSchema = SchemaFactory.createForClass(ChannelReadMarker);

// Unique index: Each user has only one read marker per channel
ChannelReadMarkerSchema.index({ channelId: 1, userId: 1 }, { unique: true });
