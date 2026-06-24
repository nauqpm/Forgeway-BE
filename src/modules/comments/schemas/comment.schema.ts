import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { normalizeForSearch } from '../../../common/utils/normalizeForSearch';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Workspace' })
  workspaceId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  content!: string;

  @Prop({ type: String, default: '', select: false })
  searchText!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ['task', 'page'] })
  targetType!: string;

  @Prop({ required: true })
  targetId!: string;

  @Prop({ type: String, index: true })
  inlineId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Comment' })
  parentId?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentions!: Types.ObjectId[];

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isResolved!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Date })
  editedAt?: Date;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ targetType: 1, targetId: 1, isDeleted: 1, createdAt: 1 });
CommentSchema.index({
  workspaceId: 1,
  targetType: 1,
  targetId: 1,
  isDeleted: 1,
  createdAt: 1,
});
CommentSchema.index({
  workspaceId: 1,
  targetType: 1,
  targetId: 1,
  parentId: 1,
});
CommentSchema.index({ parentId: 1 });
CommentSchema.index({ authorId: 1 });
CommentSchema.index({ workspaceId: 1, searchText: 1 });
CommentSchema.pre('save', function (next) {
  this.searchText = normalizeForSearch(this.content);
  next();
});
