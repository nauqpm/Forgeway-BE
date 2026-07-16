import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ORGANIZATION_STATUSES,
  OrganizationSettings,
  OrganizationStatus,
} from '../constants/organization.constants';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {
  @Prop({
    required: true,
    trim: true,
    maxlength: 120,
    validate: (value: string) => value.trim().length > 0,
  })
  name!: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  })
  slug!: string;

  @Prop({
    type: String,
    enum: ORGANIZATION_STATUSES,
    default: 'active',
  })
  status!: OrganizationStatus;

  @Prop({ type: Object, default: {} })
  settings!: OrganizationSettings;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deactivatedAt?: Date | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  lifecycleVersion!: number;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ deletedAt: 1 });
