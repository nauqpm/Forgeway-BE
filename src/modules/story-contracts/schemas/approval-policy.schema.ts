import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class StoryApprovalPolicy {
  @Prop({ required: true, default: 1, min: 1 })
  minimumApprovals!: number;
  @Prop({ required: true, default: true })
  allowAuthorApproval!: boolean;
  @Prop({ required: true, default: false })
  requireIndependentApproval!: boolean;
}

export const StoryApprovalPolicySchema =
  SchemaFactory.createForClass(StoryApprovalPolicy);
