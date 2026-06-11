import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PermissionDocument = Permission & Document;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (doc, ret: any) => {
      ret.id = ret._id.toString();
      ret._id = ret._id.toString();
      return ret;
    },
  },
})
export class Permission {
  @Prop({ required: true })
  resource!: string;

  @Prop({ required: true })
  action!: string;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
