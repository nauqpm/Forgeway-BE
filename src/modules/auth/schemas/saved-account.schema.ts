import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SavedAccountDocument = SavedAccount & Document;

/**
 * SavedAccount = một account mà root owner đã từng switch/đăng nhập thành công.
 *
 * KEY DESIGN:
 * - `rootOwnerUserId` = ID của user gốc (đăng nhập email+pass lần đầu). KHÔNG BAO GIỜ thay đổi dù
 *   đang ở session nào (A→B→C: rootOwnerUserId luôn là A).
 * - `accountId`       = account được nhớ (B hoặc C trong ví dụ trên).
 * - Unique index trên (rootOwnerUserId, accountId) → mỗi "cặp" chỉ có 1 bản ghi.
 *
 * TẠI SAO CẦN rootOwnerUserId (không dùng ownerUserId):
 *   Nếu A switch sang B (session B có token với userId=B), B muốn switch sang C:
 *   - Dùng `ownerUserId = B`  → entry {B, C} chưa tồn tại → ForbiddenException ❌
 *   - Dùng `rootOwnerUserId = A` → entry {A, C} đã được tạo khi A switch → tìm thấy ✅
 *
 * SECURITY:
 * - Không lưu password/token. Chỉ lưu metadata công khai.
 * - Switch vẫn dùng refresh token hợp lệ qua luồng "switch" có audit.
 * - "Never reauth" là quyết định chấp nhận rủi ro (no password re-prompt).
 */
@Schema({ timestamps: true, collection: 'saved_accounts' })
export class SavedAccount {
  /**
   * Root owner = user gốc đã đăng nhập email+password.
   * Luôn trỏ về root kể cả khi switch nhiều bậc (A→B→C: root = A).
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  rootOwnerUserId!: Types.ObjectId;

  /**
   * Account được nhớ (target của switch operation).
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  accountId!: Types.ObjectId;

  // ── Public metadata (cache, không dùng để auth) ─────────────────────────
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

  // ── Tracking ─────────────────────────────────────────────────────────────
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

// PRIMARY: Mỗi root-owner chỉ lưu 1 bản ghi cho mỗi account khác
SavedAccountSchema.index({ rootOwnerUserId: 1, accountId: 1 }, { unique: true });

// QUERY: Danh sách theo root-owner, sắp xếp gần nhất trước
SavedAccountSchema.index({ rootOwnerUserId: 1, lastUsedAt: -1 });
