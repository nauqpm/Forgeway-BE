import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StoryOperation {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  operation!: string;

  @Prop({ type: String, required: true, maxlength: 200 })
  key!: string;

  @Prop({ type: String, required: true })
  requestHash!: string;

  @Prop({ type: Types.ObjectId, required: true })
  resourceId!: Types.ObjectId;

  @Prop({ type: Object, required: true })
  responseSnapshot!: Record<string, unknown>;
}

export const StoryOperationSchema =
  SchemaFactory.createForClass(StoryOperation);

StoryOperationSchema.index(
  { workspaceId: 1, actorId: 1, operation: 1, key: 1 },
  { unique: true },
);
