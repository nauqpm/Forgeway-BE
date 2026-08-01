import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DECISION_PROPOSAL_STATE } from '../constants/story-contract.constants';

export type DecisionProposalDocument = HydratedDocument<DecisionProposal>;

@Schema({ timestamps: true })
export class DecisionProposal {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ required: true, trim: true })
  question!: string;
  @Prop({
    type: [
      {
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
      },
    ],
    required: true,
  })
  options!: Array<{ key: string; label: string }>;
  @Prop({ trim: true })
  recommendation?: string;
  @Prop({
    enum: Object.values(DECISION_PROPOSAL_STATE),
    default: DECISION_PROPOSAL_STATE.OPEN,
  })
  state!: string;
  @Prop({
    type: {
      kind: { type: String, enum: ['human', 'agent'], required: true },
      actorId: { type: String, required: true },
    },
    required: true,
  })
  proposedBy!: { kind: 'human' | 'agent'; actorId: string };
  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;
  @Prop()
  resolvedAt?: Date;
}

export const DecisionProposalSchema =
  SchemaFactory.createForClass(DecisionProposal);
DecisionProposalSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  state: 1,
  createdAt: -1,
});
