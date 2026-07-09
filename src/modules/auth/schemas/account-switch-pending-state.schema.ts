import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AccountSwitchPendingStateDocument =
  HydratedDocument<AccountSwitchPendingState>;

@Schema({
  collection: 'account_switch_pending_states',
  timestamps: true,
})
export class AccountSwitchPendingState {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  targetAccountId: Types.ObjectId;

  @Prop({ required: true })
  deviceId: string;

  @Prop({ required: true, unique: true, index: true })
  nonce: string;

  @Prop({ required: true, unique: true, index: true })
  stateHash: string;

  @Prop({ required: true })
  currentPageUrl: string;

  @Prop({ required: true, index: { expires: 0 } })
  expiresAt: Date;

  @Prop()
  usedAt?: Date;
}

export const AccountSwitchPendingStateSchema = SchemaFactory.createForClass(
  AccountSwitchPendingState,
);
