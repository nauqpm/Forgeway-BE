import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SprintDocument = Sprint & Document;

@Schema({ timestamps: true })
export class Sprint {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'Board', index: true })
  boardId?: Types.ObjectId;

  @Prop()
  goal?: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ type: String, enum: ['planning', 'active', 'completed'], default: 'planning' })
  status!: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const SprintSchema = SchemaFactory.createForClass(Sprint);
SprintSchema.index({ workspaceId: 1, status: 1 });
