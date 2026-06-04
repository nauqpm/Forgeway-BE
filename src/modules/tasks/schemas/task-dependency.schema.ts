import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDependencyDocument = TaskDependency & Document;

export const DEPENDENCY_TYPES = [
  'blocks',
  'is_blocked_by',
  'relates_to',
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

@Schema({ timestamps: true })
export class TaskDependency {
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  fromTaskId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  toTaskId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, enum: DEPENDENCY_TYPES, default: 'blocks' })
  type!: DependencyType;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const TaskDependencySchema =
  SchemaFactory.createForClass(TaskDependency);

// Prevent exact duplicate links
TaskDependencySchema.index(
  { workspaceId: 1, fromTaskId: 1, toTaskId: 1, type: 1 },
  { unique: true },
);
