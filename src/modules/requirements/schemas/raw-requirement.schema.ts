import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RawRequirementDocument = HydratedDocument<RawRequirement>;

@Schema({ timestamps: true })
export class RawRequirement {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  key!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 255 })
  title!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 10000 })
  body!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['manual', 'jira'],
    trim: true,
    maxlength: 100,
  })
  sourceType!: string;

  @Prop({ type: String, trim: true, maxlength: 255 })
  sourceRef?: string;

  @Prop({ type: Object })
  sourceMetadata?: Record<string, unknown>;

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active' })
  status!: 'active' | 'archived';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Date })
  archivedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  archivedBy?: Types.ObjectId;
}

export const RawRequirementSchema =
  SchemaFactory.createForClass(RawRequirement);
RawRequirementSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
RawRequirementSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
