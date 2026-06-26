import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ImageDocument = Image & Document;

@Schema({ timestamps: true })
export class Image {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  originalName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({ trim: true })
  cloudinaryPublicId?: string;

  @Prop({ trim: true })
  migrationStatus?: string;

  @Prop({ required: true })
  url!: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({
    type: String,
    enum: ['post', 'property', 'avatar', 'other'],
    default: 'other',
  })
  type!: string;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', index: true })
  workspaceId?: Types.ObjectId;

  @Prop({ trim: true })
  targetType?: string;

  @Prop()
  targetId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Channel', index: true })
  channelId?: Types.ObjectId;

  @Prop({ default: 0 })
  downloadCount!: number;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const ImageSchema = SchemaFactory.createForClass(Image);
ImageSchema.index({ uploadedBy: 1 });
ImageSchema.index({ type: 1 });
ImageSchema.index({ targetId: 1 });
ImageSchema.index({ targetType: 1, targetId: 1 });
