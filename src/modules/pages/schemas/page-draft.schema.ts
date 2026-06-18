import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PageDraftDocument = PageDraft & Document;

@Schema({ timestamps: true })
export class PageDraft {
  @Prop({ type: Types.ObjectId, ref: 'Page', required: true })
  pageId!: Types.ObjectId;

  /** HTML content derived from Yjs state — used for search and fallback */
  @Prop({ type: String, default: '' })
  content!: string;

  /** Collaborative title from Yjs Y.Text — plain text */
  @Prop({ type: String, default: '' })
  title!: string;

  /** Yjs state as a binary buffer */
  @Prop({ type: Buffer, default: Buffer.alloc(0) })
  yjsState!: Buffer;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastEditedBy?: Types.ObjectId;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const PageDraftSchema = SchemaFactory.createForClass(PageDraft);
PageDraftSchema.index({ pageId: 1 }, { unique: true });
