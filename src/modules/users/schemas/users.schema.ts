// 📁 src/modules/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email!: string;

  @Prop()
  password?: string; // 👈 Không bắt buộc nếu đăng nhập bằng Google

  @Prop()
  googleId?: string; // 👈 Thêm Google ID (tùy chọn)

  @Prop({ type: String, enum: Object.values(GLOBAL_ROLES), default: GLOBAL_ROLES.USER })
  role!: string;

  @Prop({ type: Types.ObjectId, ref: 'Role' })
  roleId?: Types.ObjectId; // 👈 ID của vai trò tùy chỉnh

  @Prop({
    type: String,
    enum: Object.values(USER_STATUSES),
    default: USER_STATUSES.PENDING_VERIFICATION,
  })
  status!: string;

  @Prop()
  fullName?: string; // Tên đầy đủ (tùy chọn)

  @Prop()
  avatar?: string; // URL avatar (tùy chọn)

  @Prop()
  phone?: string; // Số điện thoại (tùy chọn)

  @Prop()
  address?: string; // Địa chỉ (tùy chọn)

  @Prop()
  birthday?: string; // Ngày sinh (tùy chọn)

  @Prop()
  gender?: string; // Giới tính (tùy chọn)

  @Prop({ default: 0 })
  failedLoginAttempts!: number;

  @Prop()
  lockoutUntil?: Date;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  // ✅ Getter để chuyển đổi _id thành id (chuỗi)
  get id(): string {
    return this._id.toString();
  }
}

// Tạo schema cho User
export const UserSchema = SchemaFactory.createForClass(User);

// ✅ Tự động ánh xạ _id thành id trong phản hồi JSON
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.failedLoginAttempts;
    delete ret.lockoutUntil;
    delete ret.password; // 👈 Ẩn mật khẩu trong phản hồi JSON
  },
});
