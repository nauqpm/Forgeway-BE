import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DocumentVersionDoc = DocumentVersionEntity & Document;

@Schema({ timestamps: true })
export class DocumentVersionEntity {
  @Prop({ type: Types.ObjectId, ref: 'DocumentEntity', required: true })
  documentId!: Types.ObjectId;

  @Prop({ type: String, default: '' })
  htmlSnapshot!: string;

  @Prop({ type: String, required: true })
  label!: string;

  @Prop({ type: Number, required: true })
  version!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const DocumentVersionSchema = SchemaFactory.createForClass(
  DocumentVersionEntity,
);
DocumentVersionSchema.index({ documentId: 1, createdAt: -1 });
DocumentVersionSchema.index({ createdBy: 1 });
