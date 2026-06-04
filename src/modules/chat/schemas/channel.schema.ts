import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema({ timestamps: true })
export class Channel {
  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: ['public', 'private', 'direct'], default: 'public' })
  type!: string;

  @Prop({ type: Types.ObjectId, ref: 'Workspace' })
  workspaceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerId?: Types.ObjectId;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
      },
    ],
    default: [],
  })
  members!: { userId: Types.ObjectId; joinedAt: Date; role: string }[];

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessageId?: Types.ObjectId;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
ChannelSchema.index({ type: 1 });
ChannelSchema.index({ workspaceId: 1 });
