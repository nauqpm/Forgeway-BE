import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PageVersionDocument = PageVersion & Document;

@Schema({ timestamps: true })
export class PageVersion {
  @Prop({ type: Types.ObjectId, ref: 'Page', required: true })
  pageId!: Types.ObjectId;

  @Prop({ type: Buffer })
  yjsState?: Buffer;

  @Prop({ type: String })
  contentJson?: string;

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

export const PageVersionSchema = SchemaFactory.createForClass(PageVersion);
PageVersionSchema.index({ pageId: 1 });
PageVersionSchema.index({ createdBy: 1 });
PageVersionSchema.index({ pageId: 1, createdAt: -1 });
