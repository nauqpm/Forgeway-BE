import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LabelDocument = Label & Document;

@Schema({ timestamps: true })
export class Label {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 50 })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 60 })
  normalizedName!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const LabelSchema = SchemaFactory.createForClass(Label);

LabelSchema.index(
  { workspaceId: 1, normalizedName: 1 },
  { unique: true, partialFilterExpression: { isDeleted: { $eq: false } } },
);
LabelSchema.index({ workspaceId: 1, isDeleted: 1, name: 1 });
