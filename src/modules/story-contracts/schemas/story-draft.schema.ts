import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { STORY_DRAFT_STATUS } from '../constants/story-contract.constants';

export type StoryDraftDocument = HydratedDocument<StoryDraft>;

@Schema({ timestamps: true })
export class StoryDraft {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', default: null })
  baseStoryVersionId?: Types.ObjectId | null;
  @Prop({
    enum: Object.values(STORY_DRAFT_STATUS),
    default: STORY_DRAFT_STATUS.ACTIVE,
  })
  status!: string;
  @Prop({ required: true, default: 1 }) draftRevision!: number;
  @Prop({ type: Object, default: {} }) content!: Record<string, unknown>;
  @Prop({
    type: [
      {
        requirementId: {
          type: Types.ObjectId,
          ref: 'RawRequirement',
          required: true,
        },
        role: {
          type: String,
          enum: ['PRIMARY', 'SUPPORTING', 'CONSTRAINT', 'CONFLICT'],
          required: true,
        },
        evidenceNote: { type: String, maxlength: 2_000, default: '' },
      },
    ],
    default: [],
  })
  requirementLinks!: unknown[];
  @Prop({ type: [Object], default: [] }) criterionInputs!: unknown[];
  @Prop({ type: [Types.ObjectId], ref: 'DecisionProposal', default: [] })
  decisionProposalIds!: Types.ObjectId[];
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  updatedBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion' })
  submittedStoryVersionId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryDraft' })
  rebasedFromDraftId?: Types.ObjectId;
  @Prop({ type: [Object], default: [] })
  rebaseConflicts!: unknown[];
}

export const StoryDraftSchema = SchemaFactory.createForClass(StoryDraft);
StoryDraftSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  status: 1,
  createdAt: -1,
});
