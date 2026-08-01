import { ConflictException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DECISION_RECORD_IMMUTABLE } from '../constants/story-contract.constants';

export type DecisionRecordDocument = HydratedDocument<DecisionRecord>;

@Schema({ timestamps: true })
export class DecisionRecord {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'DecisionProposal', required: true })
  sourceProposalId!: Types.ObjectId;
  @Prop({ required: true, trim: true })
  question!: string;
  @Prop({ required: true, trim: true })
  selectedOption!: string;
  @Prop({ required: true, trim: true })
  rationale!: string;
  @Prop({ type: Types.ObjectId, ref: 'DecisionRecord' })
  supersedesDecisionRecordId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  decidedBy!: Types.ObjectId;
  @Prop({ required: true })
  decidedAt!: Date;
}

export const DecisionRecordSchema =
  SchemaFactory.createForClass(DecisionRecord);
DecisionRecordSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  decidedAt: 1,
});

const immutable = () =>
  new ConflictException({
    code: DECISION_RECORD_IMMUTABLE,
    message: DECISION_RECORD_IMMUTABLE,
  });

DecisionRecordSchema.pre('save', function rejectImmutableSave(next) {
  return this.isNew ? next() : next(immutable());
});
DecisionRecordSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function rejectImmutableDocumentDelete(next) {
    next(immutable());
  },
);
DecisionRecordSchema.pre(
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
    next(immutable());
  },
);
