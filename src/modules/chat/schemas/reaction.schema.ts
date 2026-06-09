import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReactionDocument = Reaction & Document;

@Schema({ timestamps: true })
export class Reaction {
  @Prop({ type: Types.ObjectId, ref: 'Message', required: true, index: true })
  messageId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  emoji!: string;

  readonly _id!: Types.ObjectId;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

// Index for unique reaction per user per message per emoji
ReactionSchema.index({ messageId: 1, userId: 1, emoji: 1 }, { unique: true });
