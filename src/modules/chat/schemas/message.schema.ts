import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class MessageAttachment {
  @Prop() url!: string;
  @Prop() name!: string;
  @Prop() size!: number;
  @Prop() mimeType!: string;
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId!: Types.ObjectId;

  @Prop({ required: false, default: '', maxlength: 4000 })
  content?: string;

  @Prop({ type: Types.ObjectId, ref: 'Sticker', default: null, index: true })
  stickerId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['text', 'file', 'image', 'system', 'sticker'],
    default: 'text',
  })
  type!: string;

  @Prop({
    type: [SchemaFactory.createForClass(MessageAttachment)],
    default: [],
  })
  attachments!: MessageAttachment[];

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  replyToId?: Types.ObjectId;

  @Prop({
    type: Map,
    of: [{ type: Types.ObjectId, ref: 'User' }],
    default: {},
  })
  reactions!: Map<string, Types.ObjectId[]>;

  @Prop({ type: Date, default: null })
  editedAt?: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  deletedForUsers!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null, index: true })
  threadParentId?: Types.ObjectId;

  @Prop({ default: 0 })
  replyCount!: number;

  @Prop({ type: Date, default: null })
  lastReplyAt?: Date;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        fullName: { type: String, required: true },
        avatar: { type: String, default: null },
      },
    ],
    default: [],
  })
  lastReplyParticipants!: {
    userId: Types.ObjectId;
    fullName: string;
    avatar?: string;
  }[];

  readonly _id!: Types.ObjectId;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ channelId: 1, createdAt: -1 });
MessageSchema.index({ channelId: 1, deletedForUsers: 1, createdAt: -1 });
MessageSchema.index({ channelId: 1, _id: -1 });
MessageSchema.index({ threadParentId: 1, createdAt: 1 });
