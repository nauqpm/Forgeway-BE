import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PageDraftDocument = PageDraft & Document;

@Schema({ timestamps: true })
export class PageDraft {
  @Prop({ type: Types.ObjectId, ref: 'Page', required: true, unique: true })
  pageId!: Types.ObjectId;

  @Prop({ type: String, default: '' })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastEditedBy?: Types.ObjectId;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const PageDraftSchema = SchemaFactory.createForClass(PageDraft);
PageDraftSchema.index({ pageId: 1 }, { unique: true });
