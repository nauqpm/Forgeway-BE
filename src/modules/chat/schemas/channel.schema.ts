import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema({ timestamps: true })
export class Channel {
  @Prop({ type: String, enum: ['general', 'workspace', 'announcement', 'dm'], required: true })
  type!: 'general' | 'workspace' | 'announcement' | 'dm';

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', default: null, index: true })
  workspaceId?: Types.ObjectId;

  @Prop({ default: false })
  isPrivate!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  readonly _id!: Types.ObjectId;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);

ChannelSchema.index({ type: 1 });
ChannelSchema.index({ workspaceId: 1 });
