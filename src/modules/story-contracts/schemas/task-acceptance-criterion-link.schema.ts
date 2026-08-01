import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TaskAcceptanceCriterionLink {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  storyVersionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcceptanceCriterion', required: true })
  acceptanceCriterionId!: Types.ObjectId;
  @Prop({
    type: Types.ObjectId,
    ref: 'AcceptanceCriterionRevision',
    required: true,
  })
  acceptanceCriterionRevisionId!: Types.ObjectId;
}

export const TaskAcceptanceCriterionLinkSchema = SchemaFactory.createForClass(
  TaskAcceptanceCriterionLink,
);
TaskAcceptanceCriterionLinkSchema.index(
  { workspaceId: 1, taskId: 1, acceptanceCriterionId: 1 },
  { unique: true },
);
