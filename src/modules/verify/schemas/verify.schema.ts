import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VerifyDocument = Verify & Document;

@Schema({ timestamps: true, expireAfterSeconds: 86400 })
export class Verify {
  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  type!: string;

  @Prop({ default: false })
  isUsed!: boolean;

  @Prop({ default: () => new Date() })
  expiresAt!: Date;

  readonly _id: any;
  readonly createdAt!: Date;
}

export const VerifySchema = SchemaFactory.createForClass(Verify);
VerifySchema.index({ email: 1, type: 1 });
