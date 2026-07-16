import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import {
  EmployeeProfile,
  EmployeeProfileSchema,
} from './schemas/employee-profile.schema';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from './schemas/organization-membership.schema';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import { EmployeeProfilesService } from './services/employee-profiles.service';
import { OrganizationMembershipsService } from './services/organization-memberships.service';
import { OrganizationTransactionService } from './services/organization-transaction.service';
import { OrganizationsService } from './services/organizations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      {
        name: OrganizationMembership.name,
        schema: OrganizationMembershipSchema,
      },
      { name: EmployeeProfile.name, schema: EmployeeProfileSchema },
    ]),
    AuditModule,
  ],
  providers: [
    OrganizationsService,
    OrganizationMembershipsService,
    EmployeeProfilesService,
    OrganizationTransactionService,
  ],
  exports: [
    OrganizationsService,
    OrganizationMembershipsService,
    EmployeeProfilesService,
  ],
})
export class OrganizationsModule {}
