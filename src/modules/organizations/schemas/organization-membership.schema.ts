import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  ORGANIZATION_ROLES,
  MembershipStatus,
  MembershipType,
  OrganizationRole,
} from '../constants/organization.constants';

export type OrganizationMembershipDocument = OrganizationMembership & Document;

@Schema({ timestamps: true })
export class OrganizationMembership {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;

  @Prop({ required: true, type: String, enum: MEMBERSHIP_TYPES })
  membershipType!: MembershipType;

  @Prop({ required: true, type: String, enum: MEMBERSHIP_STATUSES })
  status!: MembershipStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy?: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) joinedAt?: Date | null;
  @Prop({ type: Date, default: null }) suspendedAt?: Date | null;
  @Prop({ type: Date, default: null }) leftAt?: Date | null;
  @Prop({ type: Date, default: null }) removedAt?: Date | null;
  @Prop({ type: Date, default: null }) expiresAt?: Date | null;
}

export const OrganizationMembershipSchema = SchemaFactory.createForClass(
  OrganizationMembership,
);
OrganizationMembershipSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);
OrganizationMembershipSchema.index({ organizationId: 1, status: 1 });
OrganizationMembershipSchema.index({ userId: 1, status: 1 });
OrganizationMembershipSchema.index({ expiresAt: 1 }, { sparse: true });
