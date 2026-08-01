import { ConflictException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  APPROVAL_DECISION,
  APPROVAL_RECORD_IMMUTABLE,
} from '../constants/story-contract.constants';

export type ApprovalRecordDocument = HydratedDocument<ApprovalRecord>;

@Schema({ timestamps: false })
export class ApprovalRecord {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'ApprovalRequest', required: true })
  approvalRequestId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  storyVersionId!: Types.ObjectId;
  @Prop({ enum: Object.values(APPROVAL_DECISION), required: true })
  decision!: string;
  @Prop({ trim: true })
  reason?: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;
  @Prop({ required: true })
  createdAt!: Date;
}

export const ApprovalRecordSchema =
  SchemaFactory.createForClass(ApprovalRecord);
ApprovalRecordSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  storyVersionId: 1,
  createdAt: 1,
});
ApprovalRecordSchema.index(
  { approvalRequestId: 1, actorId: 1, decision: 1 },
  { unique: true },
);

const immutable = () =>
  new ConflictException({
    code: APPROVAL_RECORD_IMMUTABLE,
    message: APPROVAL_RECORD_IMMUTABLE,
  });

ApprovalRecordSchema.pre('save', function rejectImmutableSave(next) {
  return this.isNew ? next() : next(immutable());
});
ApprovalRecordSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function rejectImmutableDocumentDelete(next) {
    next(immutable());
  },
);
ApprovalRecordSchema.pre(
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
