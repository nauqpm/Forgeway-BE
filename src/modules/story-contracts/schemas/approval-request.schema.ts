import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { APPROVAL_REQUEST_STATE } from '../constants/story-contract.constants';

export type ApprovalRequestDocument = HydratedDocument<ApprovalRequest>;

@Schema({ timestamps: true })
export class ApprovalRequest {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryVersion', required: true })
  storyVersionId!: Types.ObjectId;
  @Prop({
    enum: Object.values(APPROVAL_REQUEST_STATE),
    default: APPROVAL_REQUEST_STATE.PENDING,
  })
  state!: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  requestedBy!: Types.ObjectId;
  @Prop()
  resolvedAt?: Date;
}

export const ApprovalRequestSchema =
  SchemaFactory.createForClass(ApprovalRequest);
ApprovalRequestSchema.index(
  { workspaceId: 1, storyContractId: 1, storyVersionId: 1 },
  {
    unique: true,
    partialFilterExpression: { state: APPROVAL_REQUEST_STATE.PENDING },
  },
);
ApprovalRequestSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  state: 1,
  createdAt: 1,
});
