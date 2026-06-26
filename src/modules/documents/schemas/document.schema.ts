import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DocumentDoc = DocumentEntity & Document;

@Schema({ timestamps: true })
export class DocumentEntity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true, maxlength: 255 })
  name!: string;

  @Prop({ required: true })
  originalName!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  storagePath!: string;

  @Prop({ trim: true })
  cloudinaryPublicId?: string;

  @Prop({ trim: true })
  migrationStatus?: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  extension!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({
    type: String,
    enum: ['upload', 'online'],
    default: 'upload',
    index: true,
  })
  documentType!: 'upload' | 'online';

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Workspace' }],
    default: [],
    index: true,
  })
  workspaceIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentEntity);
DocumentSchema.index({ uploadedBy: 1, deletedAt: 1 });
DocumentSchema.index({ workspaceIds: 1, deletedAt: 1 });
