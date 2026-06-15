import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  TASK_ACTIVITY_TYPE_VALUES,
  TaskActivityType,
} from '../constants/task-activity.constants';

export type TaskActivityDocument = TaskActivity & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TaskActivity {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true,
  })
  taskKey!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: TASK_ACTIVITY_TYPE_VALUES,
    required: true,
    index: true,
  })
  type!: TaskActivityType;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
}

export const TaskActivitySchema = SchemaFactory.createForClass(TaskActivity);

TaskActivitySchema.index({ workspaceId: 1, taskId: 1, createdAt: -1 });
TaskActivitySchema.index({ workspaceId: 1, taskKey: 1, createdAt: -1 });
TaskActivitySchema.index({ workspaceId: 1, actorId: 1, createdAt: -1 });
