import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SavedAccountDocument = SavedAccount & Document;

/**
 * SavedAccount is the owner-scoped switcher entry.
 *
 * SECURITY:
 * - Stores public account metadata only; no credentials or raw tokens.
 * - Switching still has to prove access to the target account, either with
 *   target credentials/SSO or a valid server-side parked session.
 * - Parked sessions live in parked_sessions, not saved_accounts.
 */@Schema({ timestamps: true, collection: 'saved_accounts' })
export class SavedAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  accountId!: Types.ObjectId;

  @Prop({ required: true })
  email!: string;

  @Prop()
  fullName?: string;

  @Prop()
  avatar?: string;

  @Prop({ required: true, default: 'user' })
  role!: string;

  @Prop({ type: String, enum: ['google', null], default: null })
  ssoProvider?: 'google' | null;

  @Prop({ type: Date, default: () => new Date() })
  lastUsedAt!: Date;

  @Prop({ type: String })
  lastIp?: string;

  @Prop({ type: String })
  lastUserAgent?: string;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const SavedAccountSchema = SchemaFactory.createForClass(SavedAccount);

// Mỗi owner chỉ lưu 1 bản ghi cho mỗi account khác
SavedAccountSchema.index({ ownerUserId: 1, accountId: 1 }, { unique: true });
// Truy vấn danh sách theo owner, sắp xếp theo lastUsedAt desc
SavedAccountSchema.index({ ownerUserId: 1, lastUsedAt: -1 });
