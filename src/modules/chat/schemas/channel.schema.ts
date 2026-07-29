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

export const LastMessageSchema =
  SchemaFactory.createForClass(LastMessageEmbedded);

@Schema({ _id: false })
export class ChannelMemberEmbedded {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['channel_admin', 'channel_member'],
    default: 'channel_member',
  })
  role!: 'channel_admin' | 'channel_member';

  @Prop({ type: Date, default: Date.now })
  joinedAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy?: Types.ObjectId;
}

export const ChannelMemberSchema = SchemaFactory.createForClass(
  ChannelMemberEmbedded,
);

@Schema({ timestamps: true })
export class Channel {
  @Prop({
    type: String,
    enum: ['general', 'workspace', 'announcement', 'dm', 'custom'],
    required: true,
  })
  type!: 'general' | 'workspace' | 'announcement' | 'dm' | 'custom';

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', default: null, index: true })
  workspaceId?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true,
  })
  organizationId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  dmParticipantKey?: string | null;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,
  })
  members!: Types.ObjectId[];

  @Prop({
    type: [ChannelMemberSchema],
    default: [],
  })
  channelMembers!: ChannelMemberEmbedded[];

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
ChannelSchema.index({ workspaceId: 1, type: 1, isPrivate: 1 });
ChannelSchema.index({ organizationId: 1, type: 1 });
ChannelSchema.index({ dmParticipantKey: 1 });
ChannelSchema.index({ 'channelMembers.userId': 1, type: 1 });
