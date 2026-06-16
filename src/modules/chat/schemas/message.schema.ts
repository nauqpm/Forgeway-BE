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

  @Prop({ required: true, maxlength: 4000 })
  content!: string;

  @Prop({
    type: String,
    enum: ['text', 'file', 'image', 'system'],
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

  @Prop({ type: Date, default: null })
  deletedAt?: Date;

  readonly _id!: Types.ObjectId;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ channelId: 1, createdAt: -1 });
MessageSchema.index({ channelId: 1, _id: -1 });
