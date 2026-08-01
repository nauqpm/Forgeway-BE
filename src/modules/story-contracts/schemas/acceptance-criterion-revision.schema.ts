import { ConflictException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ACCEPTANCE_CRITERION_PRIORITY,
  STORY_VERSION_IMMUTABLE,
} from '../constants/story-contract.constants';

export type AcceptanceCriterionRevisionDocument =
  HydratedDocument<AcceptanceCriterionRevision>;

@Schema({ timestamps: true })
export class AcceptanceCriterionRevision {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcceptanceCriterion', required: true })
  acceptanceCriterionId!: Types.ObjectId;
  @Prop({ required: true, min: 1 })
  revisionNumber!: number;
  @Prop({
    enum: Object.values(ACCEPTANCE_CRITERION_PRIORITY),
    required: true,
  })
  priority!: 'MUST' | 'SHOULD' | 'COULD';
  @Prop({ required: true, trim: true })
  statement!: string;
  @Prop({ trim: true }) given?: string;
  @Prop({ trim: true }) when?: string;
  @Prop({ trim: true }) then?: string;
  @Prop({ required: true, trim: true })
  verificationMethod!: string;
  @Prop({ required: true })
  contentHash!: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const AcceptanceCriterionRevisionSchema = SchemaFactory.createForClass(
  AcceptanceCriterionRevision,
);
AcceptanceCriterionRevisionSchema.index(
  { acceptanceCriterionId: 1, revisionNumber: 1 },
  { unique: true },
);
AcceptanceCriterionRevisionSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  acceptanceCriterionId: 1,
  createdAt: 1,
});
AcceptanceCriterionRevisionSchema.pre(
  'save',
  function rejectImmutableSave(next) {
    if (this.isNew) {
      return next();
    }
    next(
      new ConflictException({
        code: STORY_VERSION_IMMUTABLE,
        message: STORY_VERSION_IMMUTABLE,
      }),
    );
  },
);
AcceptanceCriterionRevisionSchema.pre(
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
AcceptanceCriterionRevisionSchema.pre(
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
