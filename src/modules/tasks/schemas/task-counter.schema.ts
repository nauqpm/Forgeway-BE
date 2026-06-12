import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskCounterDocument = TaskCounter & Document;

@Schema({ timestamps: true })
export class TaskCounter {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  taskSequence!: number;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const TaskCounterSchema = SchemaFactory.createForClass(TaskCounter);

TaskCounterSchema.index({ workspaceId: 1 }, { unique: true });
