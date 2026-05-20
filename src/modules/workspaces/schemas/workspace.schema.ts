import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

export type WorkspaceDocument = Workspace & Document;

@Schema({ timestamps: true })
export class Workspace {
  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  slug!: string;

  @Prop({ required: true })
  key!: string;

  @Prop({ type: String, enum: ['scrum', 'kanban'], default: 'kanban' })
  type!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: [{ userId: { type: Types.ObjectId, ref: 'User' }, role: { type: String, enum: Object.values(SPACE_ROLES) } }], default: [] })
  members!: { userId: Types.ObjectId; role: string }[];

  @Prop({ type: Object, default: {} })
  settings!: Record<string, any>;

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active' })
  status!: string;

  @Prop({ type: String, enum: ['private', 'public'], default: 'public' })
  access!: string;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);
WorkspaceSchema.index({ slug: 1 }, { unique: true });
WorkspaceSchema.index({ key: 1 }, { unique: true });
WorkspaceSchema.index({ 'members.userId': 1 });
