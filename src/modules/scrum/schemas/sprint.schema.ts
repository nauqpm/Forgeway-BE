import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SprintDocument = Sprint & Document;

@Schema({ timestamps: true })
export class Sprint {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  name!: string;

  @Prop()
  goal?: string;

  @Prop({ required: false })
  startDate?: Date;

  @Prop({ required: false })
  endDate?: Date;

  @Prop()
  duration?: string;

  @Prop({
    type: String,
    enum: ['planning', 'active', 'completed'],
    default: 'planning',
  })
  status!: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Number })
  committedStoryPoints?: number;

  @Prop({ type: Number })
  committedTasksCount?: number;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const SprintSchema = SchemaFactory.createForClass(Sprint);
SprintSchema.index({ workspaceId: 1 });
SprintSchema.index({ status: 1 });
SprintSchema.index(
  { workspaceId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active', deletedAt: null },
  },
);
