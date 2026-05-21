import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import {
  TASK_KEY_PATTERN,
  TASK_LABEL_PATTERN,
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../constants/task-status.constants';

export type TaskDocument = Task & Document;

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
}

const TaskAttachmentSchema = new MongooseSchema<TaskAttachment>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    uploadedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Sprint', index: true })
  sprintId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Board', index: true })
  boardId?: Types.ObjectId;

  @Prop({ type: String, trim: true, maxlength: 100, index: true })
  columnId?: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: TASK_KEY_PATTERN,
  })
  key!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 255,
  })
  title!: string;

  @Prop({ type: String, trim: true, maxlength: 5000 })
  description?: string;

  @Prop({ type: String, enum: TASK_TYPES, required: true })
  type!: string;

  @Prop({ type: String, enum: TASK_PRIORITIES, required: true })
  priority!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assigneeId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId!: Types.ObjectId;

  @Prop({
    type: [String],
    validate: {
      validator: (labels: string[]) =>
        labels.every((label) => TASK_LABEL_PATTERN.test(label)),
      message:
        'Task labels must be 1-50 chars and use letters, numbers, spaces, hyphens, or underscores',
    },
  })
  labels?: string[];

  @Prop({ type: [TaskAttachmentSchema] })
  attachments?: TaskAttachment[];

  @Prop({ type: Number, min: 0, max: 100 })
  storyPoints?: number;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Task', index: true })
  parentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', index: true })
  epicId?: Types.ObjectId;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
TaskSchema.index({ workspaceId: 1, columnId: 1, updatedAt: -1 });
TaskSchema.index({ workspaceId: 1, sprintId: 1, columnId: 1 });
TaskSchema.index({ workspaceId: 1, assigneeId: 1, updatedAt: -1 });
TaskSchema.index({ workspaceId: 1, type: 1, priority: 1 });
TaskSchema.index({ labels: 1 }, { sparse: true });
TaskSchema.index({ title: 'text', description: 'text' });
