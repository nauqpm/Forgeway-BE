import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '@/modules/audit/services/audit-log.service';
import { ORGANIZATION_AUDIT_EVENTS } from '@/modules/audit/constants/audit.constants';
import { OrganizationSettings } from '../constants/organization.constants';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import {
  OrganizationMembership,
  OrganizationMembershipDocument,
} from '../schemas/organization-membership.schema';
import { EmployeeProfilesService } from './employee-profiles.service';
import { OrganizationTransactionService } from './organization-transaction.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<OrganizationDocument>,
    @InjectModel(OrganizationMembership.name)
    private readonly memberships: Model<OrganizationMembershipDocument>,
    private readonly transactions: OrganizationTransactionService,
    private readonly profiles: EmployeeProfilesService,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: {
    name: string;
    slug: string;
    createdBy: string;
    settings?: OrganizationSettings;
  }): Promise<Organization> {
    const settings = input.settings ?? {};
    try {
      const organization = await this.transactions.run(async session => {
        const [organization] = await this.organizations.create(
          [
            {
              name: input.name,
              slug: input.slug.toLowerCase(),
              createdBy: new Types.ObjectId(input.createdBy),
              settings,
            },
          ],
          { session },
        );
        const [owner] = await this.memberships.create(
          [
            {
              organizationId: organization._id,
              userId: new Types.ObjectId(input.createdBy),
              role: 'owner',
              membershipType: 'employee',
              status: 'active',
              joinedAt: new Date(),
            },
          ],
          { session },
        );
        await this.profiles.createForMembershipIfRequired(
          owner,
          settings,
          session,
        );
        return organization;
      });
      this.audit.log({
        type: ORGANIZATION_AUDIT_EVENTS.ORGANIZATION_CREATED,
        severity: 'INFO',
        userId: input.createdBy,
        metadata: { organizationId: organization._id.toString() },
      });
      return organization;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      )
        throw new ConflictException('Organization slug already exists');
      throw error;
    }
  }
}
