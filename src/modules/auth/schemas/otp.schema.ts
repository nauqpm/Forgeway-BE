import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpDocument = Otp & Document;

@Schema({ timestamps: true })
export class Otp {
  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: false })
  isUsed!: boolean;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// MongoDB removes expired OTP records automatically once expiresAt is reached.
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ email: 1, isUsed: 1, expiresAt: -1 });
