import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkflowDocument = Workflow & Document;

@Schema()
export class WorkflowStatus {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '#6b7280' })
  color!: string;

  @Prop({ type: String, enum: ['todo', 'inprogress', 'done'], default: 'todo' })
  category!: string;
}

@Schema()
export class WorkflowTransition {
  @Prop({ required: true })
  fromStatus!: string;

  @Prop({ required: true })
  toStatus!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: Object, default: null })
  conditions?: Record<string, any>;
}

@Schema({ timestamps: true })
export class Workflow {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  defaultStatus!: string;

  @Prop({ type: [SchemaFactory.createForClass(WorkflowStatus)], default: [] })
  statuses!: WorkflowStatus[];

  @Prop({
    type: [SchemaFactory.createForClass(WorkflowTransition)],
    default: [],
  })
  transitions!: WorkflowTransition[];

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
WorkflowSchema.index({ workspaceId: 1 }, { unique: true });
