import { ConflictException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ACCEPTANCE_CRITERION_PRIORITY,
  STORY_REQUIREMENT_ROLE,
  STORY_VERSION_IMMUTABLE,
} from '../constants/story-contract.constants';

export type StoryVersionDocument = HydratedDocument<StoryVersion>;

@Schema({ timestamps: true })
export class StoryVersion {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ required: true, min: 1 })
  versionNumber!: number;
  @Prop({ type: Types.ObjectId, ref: 'StoryDraft', required: true })
  sourceDraftId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', default: null })
  baseStoryVersionId?: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  submittedBy!: Types.ObjectId;
  @Prop({ required: true })
  submittedAt!: Date;
  @Prop({ type: Object, required: true })
  contentSnapshot!: Record<string, unknown>;
  @Prop({
    type: [
      {
        requirementId: {
          type: Types.ObjectId,
          ref: 'RawRequirement',
          required: true,
        },
        relationship: {
          type: String,
          enum: Object.values(STORY_REQUIREMENT_ROLE),
          required: true,
        },
        evidenceNote: { type: String, default: '' },
      },
    ],
    default: [],
  })
  requirementLinkSnapshot!: unknown[];
  @Prop({
    type: [
      {
        acceptanceCriterionId: {
          type: Types.ObjectId,
          ref: 'AcceptanceCriterion',
          required: true,
        },
        acceptanceCriterionRevisionId: {
          type: Types.ObjectId,
          ref: 'AcceptanceCriterionRevision',
          required: true,
        },
        key: { type: String, required: true },
        priority: {
          type: String,
          enum: Object.values(ACCEPTANCE_CRITERION_PRIORITY),
          required: true,
        },
      },
    ],
    default: [],
  })
  criteria!: unknown[];
  @Prop({ type: [Types.ObjectId], ref: 'DecisionRecord', default: [] })
  decisionRecordIds!: Types.ObjectId[];
  @Prop({ required: true })
  contentHash!: string;
}

export const StoryVersionSchema = SchemaFactory.createForClass(StoryVersion);
StoryVersionSchema.index(
  { workspaceId: 1, storyContractId: 1, versionNumber: 1 },
  { unique: true },
);
StoryVersionSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  createdAt: 1,
});
StoryVersionSchema.index({ sourceDraftId: 1 }, { unique: true });
StoryVersionSchema.pre('save', function rejectImmutableSave(next) {
  if (this.isNew) {
    return next();
  }
  next(
    new ConflictException({
      code: STORY_VERSION_IMMUTABLE,
      message: STORY_VERSION_IMMUTABLE,
    }),
  );
});
StoryVersionSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function rejectImmutableDocumentDelete(next) {
    next(
      new ConflictException({
        code: STORY_VERSION_IMMUTABLE,
        message: STORY_VERSION_IMMUTABLE,
      }),
    );
  },
);
StoryVersionSchema.pre(
  [
    'updateOne',
    'updateMany',
    'replaceOne',
    'findOneAndUpdate',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function rejectImmutableMutation(next) {
    next(
      new ConflictException({
        code: STORY_VERSION_IMMUTABLE,
        message: STORY_VERSION_IMMUTABLE,
      }),
    );
  },
);
