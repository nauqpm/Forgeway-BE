import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkspacePreferenceDocument = HydratedDocument<WorkspacePreference>;

@Schema({ timestamps: true, collection: 'workspace_preferences' })
export class WorkspacePreference {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isStarred!: boolean;

  @Prop({ type: Number, default: 0, min: 0 })
  position!: number;

  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const WorkspacePreferenceSchema =
  SchemaFactory.createForClass(WorkspacePreference);

WorkspacePreferenceSchema.index(
  { userId: 1, workspaceId: 1 },
  { unique: true },
);
WorkspacePreferenceSchema.index({ userId: 1, isStarred: 1, position: 1 });
