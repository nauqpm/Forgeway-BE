import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { normalizeForSearch } from '../../../common/utils/normalizeForSearch';

export type PageDocument = Page & Document;

@Schema({ timestamps: true })
export class Page {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, default: '' })
  title!: string;

  @Prop({ type: String, default: '' })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'Page' })
  parentId?: Types.ObjectId;

  @Prop({ required: true })
  slug!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastEditedBy?: Types.ObjectId;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ type: Buffer })
  yjsState?: Buffer;

  @Prop({ type: String })
  contentJson?: string;

  @Prop({ type: String, default: '' })
  plainTextSnapshot?: string;

  @Prop({ type: String, default: '', select: false })
  searchText!: string;

  @Prop({ type: [String], default: [] })
  labels!: string[];

  // @Prop({ type: Number, default: 0 })
  // viewCount!: number;

  @Prop({
    type: [
      {
        editedBy: { type: Types.ObjectId, ref: 'User' },
        editedAt: Date,
        changes: String,
      },
    ],
    default: [],
  })
  versionHistory!: {
    editedBy: Types.ObjectId;
    editedAt: Date;
    changes: string;
  }[];

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const PageSchema = SchemaFactory.createForClass(Page);
PageSchema.index({ workspaceId: 1 });
PageSchema.index({ parentId: 1 });
PageSchema.index({ authorId: 1 });
PageSchema.index({ labels: 1 });
PageSchema.index({ title: 'text', content: 'text' });
PageSchema.index({ workspaceId: 1, searchText: 1 });
PageSchema.pre('save', function (next) {
  this.searchText = normalizeForSearch(
    [this.title, this.plainTextSnapshot || this.content, this.slug].join(' '),
  );
  next();
});
