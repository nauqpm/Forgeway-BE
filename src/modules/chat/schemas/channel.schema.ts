import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema({ _id: false })
export class LastMessageEmbedded {
  @Prop({ type: String })
  content?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderId?: Types.ObjectId;

  @Prop({ type: String })
  senderName?: string;

  @Prop({ type: Date })
  sentAt?: Date;

  @Prop({ type: String })
  type?: string;
}

export const LastMessageSchema = SchemaFactory.createForClass(LastMessageEmbedded);

@Schema({ timestamps: true })
export class Channel {
  @Prop({
    type: String,
    enum: ['general', 'workspace', 'announcement', 'dm'],
    required: true,
  })
  type!: 'general' | 'workspace' | 'announcement' | 'dm';

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', default: null, index: true })
  workspaceId?: Types.ObjectId;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,
  })
  members!: Types.ObjectId[];

  @Prop({
    type: LastMessageSchema,
    default: null,
  })
  lastMessage?: LastMessageEmbedded;

  @Prop({ default: false })
  isPrivate!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  readonly _id!: Types.ObjectId;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);

ChannelSchema.index({ type: 1 });
