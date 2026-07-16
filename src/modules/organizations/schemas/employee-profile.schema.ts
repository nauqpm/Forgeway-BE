import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeProfileDocument = EmployeeProfile & Document;

@Schema({ timestamps: true })
export class EmployeeProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Organization' })
  organizationId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'OrganizationMembership' })
  organizationMembershipId!: Types.ObjectId;
  @Prop({ type: String, trim: true, default: null }) employeeCode?:
    | string
    | null;
  @Prop({ type: String, trim: true, default: null }) jobTitle?: string | null;
  @Prop({ type: Types.ObjectId, ref: 'OrganizationMembership', default: null })
  managerOrganizationMembershipId?: Types.ObjectId | null;
  @Prop({ type: String, trim: true, default: null }) employmentType?:
    | string
    | null;
  @Prop({ type: Date, default: null }) startDate?: Date | null;
  @Prop({ type: Date, default: null }) endDate?: Date | null;
  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status!: 'active' | 'inactive';
}

export const EmployeeProfileSchema =
  SchemaFactory.createForClass(EmployeeProfile);
EmployeeProfileSchema.index({ organizationMembershipId: 1 }, { unique: true });
EmployeeProfileSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
EmployeeProfileSchema.index(
  { organizationId: 1, employeeCode: 1 },
  { unique: true, sparse: true },
);
EmployeeProfileSchema.index({
  organizationId: 1,
  managerOrganizationMembershipId: 1,
});
