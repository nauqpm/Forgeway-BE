import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TokenDocument = Token & Document;

import type { TokenTypeLiteral } from '../constants/token.constants';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

export type TokenType = TokenTypeLiteral;

@Schema({ timestamps: true })
export class Token {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  email!: string;

  @Prop({ default: GLOBAL_ROLES.USER })
  role!: string;

  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ default: 'Unknown' })
  deviceInfo!: string;

  @Prop({ default: true })
  status!: boolean;

  @Prop({
    type: String,
    enum: ['access', 'refresh', 'password-reset-grant'],
    default: 'access',
  })
  type!: TokenType;

  // SEC-8: Token family — tất cả refresh token cùng session chia sẻ familyId
  // Dùng để detect reuse attack (token theft detection)
  @Prop({ type: String })
  familyId?: string;

  @Prop({ type: Date, expires: 0 })
  expiresAt?: Date;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const TokenSchema = SchemaFactory.createForClass(Token);

// ✅ Compound index: tối ưu truy vấn revoke theo userId + type + status
// Dùng cho: updateMany({ userId, type: 'access', status: true }, { status: false })
TokenSchema.index({ userId: 1, type: 1, status: 1 });

// ✅ Compound index: tối ưu truy vấn token lookup kết hợp status và type
// Dùng cho: findOne({ token: hash, status: true, type: 'refresh' })
// Lưu ý: token đã có unique index riêng, compound này hỗ trợ covered query
TokenSchema.index({ token: 1, status: 1, type: 1 });

// SEC-8: Index cho family-wide revoke khi detect theft
// Dùng cho: updateMany({ familyId, status: true }, { status: false })
TokenSchema.index({ familyId: 1, status: 1 });
