import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { STORY_REQUIREMENT_ROLE } from '../constants/story-contract.constants';

export type StoryRequirementLinkDocument =
  HydratedDocument<StoryRequirementLink>;

@Schema({ timestamps: true })
export class StoryRequirementLink {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  storyVersionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'RawRequirement', required: true })
  requirementId!: Types.ObjectId;
  @Prop({ enum: Object.values(STORY_REQUIREMENT_ROLE), required: true })
  relationship!: string;
  @Prop({ default: '', trim: true })
  evidenceNote!: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  linkedBy!: Types.ObjectId;
  @Prop({ required: true })
  linkedAt!: Date;
}

export const StoryRequirementLinkSchema =
  SchemaFactory.createForClass(StoryRequirementLink);
StoryRequirementLinkSchema.index(
  { storyVersionId: 1, requirementId: 1, relationship: 1 },
  { unique: true },
);
StoryRequirementLinkSchema.index({ workspaceId: 1, requirementId: 1 });
StoryRequirementLinkSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  storyVersionId: 1,
});
