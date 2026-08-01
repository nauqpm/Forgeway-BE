import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { STORY_CONTRACT_STATUS } from '../constants/story-contract.constants';

export type StoryContractDocument = HydratedDocument<StoryContract>;

@Schema({ timestamps: true })
export class StoryContract {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ required: true, trim: true }) key!: string;
  @Prop({ required: true, trim: true }) title!: string;
  @Prop({
    enum: Object.values(STORY_CONTRACT_STATUS),
    default: STORY_CONTRACT_STATUS.ACTIVE,
  })
  status!: string;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion' })
  currentApprovedStoryVersionId?: Types.ObjectId;
  @Prop({ required: true, default: 0 })
  latestStoryVersionNumber!: number;
  @Prop({ required: true, default: 1 }) version!: number;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
  @Prop() archivedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) archivedBy?: Types.ObjectId;
}

export const StoryContractSchema = SchemaFactory.createForClass(StoryContract);
StoryContractSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
StoryContractSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
