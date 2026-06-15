import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Permission } from './permission.schema';

export type UserPermissionDocument = UserPermission & Document;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (doc, ret: any) => {
      ret.id = ret._id.toString();
      ret.userId = ret.userId.toString();
      if (ret.permissionId) {
        if (typeof ret.permissionId === 'object') {
          ret.permissionId = {
            ...ret.permissionId,
            id: ret.permissionId._id.toString(),
            _id: ret.permissionId._id.toString(),
          };
        } else {
          ret.permissionId = ret.permissionId.toString();
        }
      }
      return ret;
    },
  },
})
export class UserPermission {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Permission' })
  permissionId!: Types.ObjectId | Permission;
}

export const UserPermissionSchema =
  SchemaFactory.createForClass(UserPermission);
