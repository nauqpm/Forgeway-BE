import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecentLoginDocument = RecentLogin & Document;

/**
 * RecentLogin = một account đã từng đăng nhập thành công trên một device cụ thể.
 *
 * Khác với SavedAccount (lưu theo owner để phục vụ "switch account" có audit):
 *  - Lưu theo `deviceId` (cookie HttpOnly) — KHÔNG cần owner cũ tồn tại.
 *  - Mỗi lần login thành công đều ghi 1 row, kể cả khi user logout account trước.
 *  - Mục đích: hiển thị "Tài khoản gần đây trên thiết bị này" trong dropdown.
 *
 * SECURITY:
 *  - `deviceId` là UUID ngẫu nhiên HttpOnly → user không thể tự sửa, server mới phát hành.
 *  - Cookie tồn tại 1 năm. Nếu user xoá cookie device_id → list "gần đây" trống cho lần login tới.
 *  - Endpoint list dùng `JwtAuthGuard` → phải có session hiện tại, nhưng nội dung trả theo device.
 *    Điều này cho phép account A thấy account B đã login cùng máy, kể cả khi B không nằm trong
 *    saved_accounts của A (vì A chưa từng là "owner" tại thời điểm B login).
 */
@Schema({ timestamps: true, collection: 'recent_logins' })
export class RecentLogin {
  @Prop({ type: String, required: true, index: true })
  deviceId!: string;

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

export const RecentLoginSchema = SchemaFactory.createForClass(RecentLogin);

// Mỗi device chỉ lưu 1 bản ghi cho mỗi account
RecentLoginSchema.index({ deviceId: 1, accountId: 1 }, { unique: true });
// Truy vấn danh sách theo device, sắp xếp theo lastUsedAt desc
RecentLoginSchema.index({ deviceId: 1, lastUsedAt: -1 });
