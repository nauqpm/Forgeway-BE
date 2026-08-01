import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoryVersionChangeSetDocument =
  HydratedDocument<StoryVersionChangeSet>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StoryVersionChangeSet {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  fromStoryVersionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  toStoryVersionId!: Types.ObjectId;
  @Prop({ required: true }) fromContentHash!: string;
  @Prop({ required: true }) toContentHash!: string;
  @Prop({ type: [Object], default: [] }) scopeChanges!: unknown[];
  @Prop({ type: [Object], default: [] }) businessRuleChanges!: unknown[];
  @Prop({ type: [Object], default: [] }) permissionChanges!: unknown[];
  @Prop({ type: [Object], default: [] }) requirementChanges!: unknown[];
  @Prop({ type: [Object], default: [] })
  acceptanceCriterionChanges!: unknown[];
  @Prop({ type: [Object], default: [] }) decisionChanges!: unknown[];
  @Prop({ type: [Object], default: [] }) dependencyChanges!: unknown[];
}

export const StoryVersionChangeSetSchema = SchemaFactory.createForClass(
  StoryVersionChangeSet,
);
StoryVersionChangeSetSchema.index(
  {
    workspaceId: 1,
    storyContractId: 1,
    fromStoryVersionId: 1,
    toStoryVersionId: 1,
  },
  { unique: true },
);
