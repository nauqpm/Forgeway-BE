import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttachmentDocument = Attachment & Document;

@Schema({ timestamps: true })
export class Attachment {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', index: true })
  workspaceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  filename!: string;

  @Prop({ required: true, trim: true })
  originalName!: string;

  @Prop({ required: true, trim: true })
  mimeType!: string;

  @Prop({ required: true, min: 0 })
  size!: number;

  @Prop({ required: true, trim: true })
  storageKey!: string;

  @Prop({ trim: true })
  url?: string;

  @Prop({ trim: true })
  cloudinaryPublicId?: string;

  @Prop({ trim: true })
  migrationStatus?: string;

  @Prop({ type: String, enum: ['task', 'page', 'channel'], required: true })
  targetType!: string;

  @Prop({ required: true })
  targetId!: string;

  @Prop({ type: Types.ObjectId, ref: 'Channel', index: true })
  channelId?: Types.ObjectId;

  @Prop({ default: 0, min: 0 })
  downloadCount!: number;

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

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
AttachmentSchema.index({
  targetType: 1,
  targetId: 1,
  isDeleted: 1,
  createdAt: -1,
});
AttachmentSchema.index({
  workspaceId: 1,
  targetType: 1,
  targetId: 1,
  isDeleted: 1,
  createdAt: -1,
});
AttachmentSchema.index({ uploadedBy: 1 });
