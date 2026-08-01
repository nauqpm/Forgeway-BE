import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AcceptanceCriterionDocument = HydratedDocument<AcceptanceCriterion>;

@Schema({ timestamps: true })
export class AcceptanceCriterion {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StoryContract', required: true })
  storyContractId!: Types.ObjectId;
  @Prop({ required: true, trim: true })
  key!: string;
  @Prop({ enum: ['ACTIVE', 'RETIRED'], default: 'ACTIVE' })
  lifecycle!: 'ACTIVE' | 'RETIRED';
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
  @Prop() retiredAt?: Date;
}

export const AcceptanceCriterionSchema =
  SchemaFactory.createForClass(AcceptanceCriterion);
AcceptanceCriterionSchema.index(
  { workspaceId: 1, storyContractId: 1, key: 1 },
  { unique: true },
);
AcceptanceCriterionSchema.index({
  workspaceId: 1,
  storyContractId: 1,
  createdAt: 1,
});
