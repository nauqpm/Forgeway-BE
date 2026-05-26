import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PageDocument = Page & Document;

@Schema({ timestamps: true })
export class Page {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true })
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

  @Prop({ type: String, enum: ['draft', 'published'], default: 'draft' })
  status!: string;

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
PageSchema.index({ status: 1 });
PageSchema.index({ labels: 1 });
PageSchema.index({ title: 'text', content: 'text' });
