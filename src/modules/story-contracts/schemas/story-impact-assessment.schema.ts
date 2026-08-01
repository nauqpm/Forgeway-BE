import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StoryImpactAssessment {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  fromStoryVersionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  toStoryVersionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;
  @Prop({ type: [Types.ObjectId], ref: 'AcceptanceCriterion', default: [] })
  affectedCriterionIds!: Types.ObjectId[];
  @Prop({
    type: String,
    enum: ['CURRENT', 'REVIEW_REQUIRED', 'REBASE_REQUIRED'],
    required: true,
  })
  requirementsState!: string;
  @Prop({ type: String, enum: ['PENDING', 'RESOLVED'], default: 'PENDING' })
  state!: string;
  @Prop({ type: Date }) resolvedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) resolvedBy?: Types.ObjectId;
}

export const StoryImpactAssessmentSchema = SchemaFactory.createForClass(
  StoryImpactAssessment,
);
StoryImpactAssessmentSchema.index(
  { workspaceId: 1, taskId: 1, fromStoryVersionId: 1, toStoryVersionId: 1 },
  { unique: true },
);
