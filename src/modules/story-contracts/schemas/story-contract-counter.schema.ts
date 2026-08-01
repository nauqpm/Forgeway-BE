import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoryContractCounterDocument =
  HydratedDocument<StoryContractCounter>;

@Schema({ timestamps: true })
export class StoryContractCounter {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ required: true, default: 0 }) sequence!: number;
}

export const StoryContractCounterSchema =
  SchemaFactory.createForClass(StoryContractCounter);
StoryContractCounterSchema.index({ workspaceId: 1 }, { unique: true });
