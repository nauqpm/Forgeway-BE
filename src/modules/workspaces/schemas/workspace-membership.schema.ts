import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  SPACE_ROLES,
  SpaceRole,
} from '@/common/constants/space-role.constants';

export const WORKSPACE_MEMBERSHIP_STATUSES = [
  'invited',
  'active',
  'suspended',
  'left',
  'removed',
] as const;
export const WORKSPACE_MEMBERSHIP_SOURCES = [
  'owner',
  'legacy_embedded',
  'invitation',
  'direct',
] as const;
export type WorkspaceMembershipStatus =
  (typeof WORKSPACE_MEMBERSHIP_STATUSES)[number];
export type WorkspaceMembershipSource =
  (typeof WORKSPACE_MEMBERSHIP_SOURCES)[number];
export type WorkspaceMembershipDocument = WorkspaceMembership & Document;

@Schema({ timestamps: true })
export class WorkspaceMembership {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Workspace' })
  workspaceId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Organization' })
  organizationId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(SPACE_ROLES) }) role!: SpaceRole;
  @Prop({
    required: true,
    enum: WORKSPACE_MEMBERSHIP_STATUSES,
    default: 'active',
  })
  status!: WorkspaceMembershipStatus;
  @Prop({ required: true, enum: WORKSPACE_MEMBERSHIP_SOURCES })
  source!: WorkspaceMembershipSource;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy?: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) joinedAt?: Date | null;
  @Prop({ type: Date, default: null }) suspendedAt?: Date | null;
  @Prop({ type: Date, default: null }) leftAt?: Date | null;
  @Prop({ type: Date, default: null }) removedAt?: Date | null;
  @Prop({ type: Date, default: null }) expiresAt?: Date | null;
  @Prop({ type: Date, default: null }) lastSyncedFromLegacyAt?: Date | null;
  @Prop({ type: Date, default: null }) deletedAt?: Date | null;
}
export const WorkspaceMembershipSchema =
  SchemaFactory.createForClass(WorkspaceMembership);
WorkspaceMembershipSchema.index(
  { workspaceId: 1, userId: 1 },
  { unique: true },
);
WorkspaceMembershipSchema.index({ organizationId: 1, userId: 1, status: 1 });
WorkspaceMembershipSchema.index({ workspaceId: 1, status: 1 });
WorkspaceMembershipSchema.index({ userId: 1, status: 1 });
WorkspaceMembershipSchema.index({ expiresAt: 1 }, { sparse: true });
