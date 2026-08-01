import { ConflictException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CriterionVerificationDocument =
  HydratedDocument<CriterionVerification>;

const IMMUTABLE = 'CRITERION_VERIFICATION_IMMUTABLE';

@Schema({ timestamps: true })
export class CriterionVerification {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
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
  @Prop({ enum: ['PASSED', 'FAILED', 'INCONCLUSIVE'], required: true })
  status!: 'PASSED' | 'FAILED' | 'INCONCLUSIVE';
  @Prop({ required: true, trim: true })
  evidenceType!: string;
  @Prop({ required: true, trim: true })
  evidenceRef!: string;
  @Prop({ type: Types.ObjectId, ref: 'Task' })
  taskId?: Types.ObjectId;
  @Prop({ trim: true })
  pullRequestRef?: string;
  @Prop({ trim: true })
  qaRunRef?: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  submittedBy!: Types.ObjectId;
  @Prop({ required: true })
  submittedAt!: Date;
}

export const CriterionVerificationSchema = SchemaFactory.createForClass(
  CriterionVerification,
);
CriterionVerificationSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  storyVersionId: 1,
  acceptanceCriterionId: 1,
  acceptanceCriterionRevisionId: 1,
  submittedAt: 1,
});
CriterionVerificationSchema.index({ workspaceId: 1, taskId: 1 });
CriterionVerificationSchema.pre('save', function rejectImmutableSave(next) {
  if (this.isNew) return next();
  next(
    new ConflictException({
      code: IMMUTABLE,
      message: IMMUTABLE,
    }),
  );
});
CriterionVerificationSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function rejectImmutableDocumentDelete(next) {
    next(
      new ConflictException({
        code: IMMUTABLE,
        message: IMMUTABLE,
      }),
    );
  },
);
CriterionVerificationSchema.pre(
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
        code: IMMUTABLE,
        message: IMMUTABLE,
      }),
    );
  },
);
