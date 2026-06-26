// src/modules/users/schemas/user.schema.ts
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
  password?: string; // Optional for Google OAuth users

  @Prop()
  googleId?: string; // Google OAuth identifier (optional)

  @Prop({
    type: String,
    enum: Object.values(GLOBAL_ROLES),
    default: GLOBAL_ROLES.USER,
  })
  role!: string;

  @Prop({ type: Types.ObjectId, ref: 'Role' })
  roleId?: Types.ObjectId; // ID of custom role

  @Prop({
    type: String,
    enum: Object.values(USER_STATUSES),
    default: USER_STATUSES.PENDING_VERIFICATION,
  })
  status!: string;

  @Prop()
  fullName?: string; // Full name (optional)

  @Prop()
  avatar?: string; // Avatar URL (optional)

  @Prop()
  phone?: string; // Phone number (optional)

  @Prop()
  address?: string; // Address (optional)

  @Prop()
  birthday?: string; // Birth date (optional)

  @Prop()
  gender?: string; // Gender (optional)

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  // Getter to expose _id as id string
  get id(): string {
    return this._id.toString();
  }
}

export const UserSchema = SchemaFactory.createForClass(User);

// Auto-map _id to id in JSON responses and exclude sensitive fields
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password; // Exclude password from JSON responses

    if (ret.googleId) {
      ret.ssoProvider = 'google';
    }
  },
});
