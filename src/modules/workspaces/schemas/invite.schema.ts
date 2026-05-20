import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

export type InviteDocument = Invite & Document;

export const INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
} as const;

export type InviteStatusValue = typeof INVITE_STATUS[keyof typeof INVITE_STATUS];

@Schema({ timestamps: true })
export class Invite {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Workspace' })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  invitedEmail!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  invitedBy!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(SPACE_ROLES), default: SPACE_ROLES.MEMBER })
  role!: string;

  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({
    required: true,
    enum: Object.values(INVITE_STATUS),
    default: INVITE_STATUS.PENDING,
  })
  status!: InviteStatusValue;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const InviteSchema = SchemaFactory.createForClass(Invite);
InviteSchema.index({ workspaceId: 1, invitedEmail: 1, status: 1 });
InviteSchema.index({ token: 1 }, { unique: true });
InviteSchema.index({ invitedEmail: 1, status: 1 });
