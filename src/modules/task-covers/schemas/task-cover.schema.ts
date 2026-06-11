import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  TASK_COVER_SOURCE_VALUES,
  TASK_COVER_TYPE_VALUES,
  TaskCoverSource,
  TaskCoverType,
} from '../constants/task-cover.constants';

@Schema({ _id: false })
export class TaskCoverEmbedded {
  @Prop({ type: String, enum: TASK_COVER_TYPE_VALUES, required: true })
  type!: TaskCoverType;

  @Prop({ type: String, trim: true })
  color?: string;

  @Prop({ type: String, trim: true })
  imageUrl?: string;

  @Prop({ type: String, enum: TASK_COVER_SOURCE_VALUES })
  source?: TaskCoverSource;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const TaskCoverSchema = SchemaFactory.createForClass(TaskCoverEmbedded);
