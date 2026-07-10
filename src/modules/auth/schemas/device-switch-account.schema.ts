import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceSwitchAccountDocument = DeviceSwitchAccount & Document;
export type DeviceSwitchAccountProvider = 'password' | 'google';
export type DeviceSwitchAccountStatus = 'active' | 'expired' | 'removed';

@Schema({ timestamps: true, collection: 'device_switch_accounts' })
export class DeviceSwitchAccount {
  @Prop({ required: true, index: true })
  deviceId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['active', 'expired', 'removed'],
    required: true,
  })
  status!: DeviceSwitchAccountStatus;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, required: true })
  lastAuthenticatedAt!: Date;

  @Prop({ type: Date, default: null })
  lastSwitchedAt!: Date | null;

  @Prop({ required: true })
  displayName!: string;

  @Prop({ required: true })
  maskedEmail!: string;

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  @Prop({ type: String, enum: ['password', 'google'], required: true })
  provider!: DeviceSwitchAccountProvider;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const DeviceSwitchAccountSchema =
  SchemaFactory.createForClass(DeviceSwitchAccount);

DeviceSwitchAccountSchema.index({ deviceId: 1, userId: 1 }, { unique: true });
DeviceSwitchAccountSchema.index({ deviceId: 1, status: 1, expiresAt: 1 });
DeviceSwitchAccountSchema.index({ status: 1, expiresAt: 1 });
