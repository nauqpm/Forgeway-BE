import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SavedAccountDocument = SavedAccount & Document;

/**
 * SavedAccount = một account mà owner đã từng đăng nhập thành công trên cùng browser.
 *
 * SECURITY:
 * - Lưu theo `ownerUserId` (account đang login) → chỉ chính owner mới đọc được list của mình.
 * - Không lưu password. Chỉ lưu `accountId` tham chiếu + metadata công khai.
 * - Switch vẫn dùng refresh token còn hạn trong DB; token mới được cấp qua luồng "switch" có audit.
 * - Per requirement: "never reauth" → KHÔNG yêu cầu password khi switch.
 *   Đây là quyết định chấp nhận rủi ro; cân nhắc bật xác thực lại sau nếu cần.
 */
@Schema({ timestamps: true, collection: 'saved_accounts' })
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
