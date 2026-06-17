import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

export type InviteDocument = Invite & Document;

export const INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
} as const;

export type InviteStatusValue =
  (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];

export const INVITE_TYPES = {
  EMAIL: 'email',
  LINK: 'link',
} as const;

export type InviteTypeValue = (typeof INVITE_TYPES)[keyof typeof INVITE_TYPES];

@Schema({ timestamps: true })
export class Invite {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Workspace' })
  workspaceId!: Types.ObjectId;

  @Prop({
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    default: null,
  })
  invitedEmail?: string | null;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  invitedBy!: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(SPACE_ROLES),
    default: SPACE_ROLES.MEMBER,
  })
  role!: string;

  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({
    required: true,
    enum: Object.values(INVITE_TYPES),
    default: INVITE_TYPES.EMAIL,
  })
  type!: InviteTypeValue;

  @Prop({
    required: true,
    enum: Object.values(INVITE_STATUS),
    default: INVITE_STATUS.PENDING,
  })
  status!: InviteStatusValue;

  @Prop({ type: Date, required: false, default: null })
  expiresAt?: Date | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  acceptedBy!: Types.ObjectId[];
}

export const InviteSchema = SchemaFactory.createForClass(Invite);
InviteSchema.index({ workspaceId: 1, invitedEmail: 1, status: 1 });
InviteSchema.index({ invitedEmail: 1, status: 1 });
InviteSchema.index({ workspaceId: 1, status: 1, type: 1 });
