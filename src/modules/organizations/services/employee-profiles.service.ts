import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { OrganizationSettings } from '../constants/organization.constants';
import {
  shouldCreateEmployeeProfile,
  isMembershipActive,
} from '../policies/organization-membership.policy';
import {
  EmployeeProfile,
  EmployeeProfileDocument,
} from '../schemas/employee-profile.schema';
import {
  OrganizationMembership,
  OrganizationMembershipDocument,
} from '../schemas/organization-membership.schema';

@Injectable()
export class EmployeeProfilesService {
  constructor(
    @InjectModel(EmployeeProfile.name)
    private readonly profiles: Model<EmployeeProfileDocument>,
    @InjectModel(OrganizationMembership.name)
    private readonly memberships: Model<OrganizationMembershipDocument>,
  ) {}

  async createForMembershipIfRequired(
    membership: OrganizationMembershipDocument,
    settings: OrganizationSettings,
    session: ClientSession,
  ): Promise<EmployeeProfile | null> {
    if (!shouldCreateEmployeeProfile(membership.membershipType, settings))
      return null;
    const existing = await this.profiles
      .findOne({ organizationMembershipId: membership._id })
      .session(session)
      .exec();
    if (existing) return existing;
    const [profile] = await this.profiles.create(
      [
        {
          organizationId: membership.organizationId,
          userId: membership.userId,
          organizationMembershipId: membership._id,
        },
      ],
      { session },
    );
    return profile;
  }

  async validateManager(
    organizationId: Types.ObjectId,
    membershipId: Types.ObjectId,
    managerId: Types.ObjectId | null | undefined,
    session: ClientSession,
  ): Promise<void> {
    if (!managerId) return;
    if (managerId.equals(membershipId))
      throw new BadRequestException('A membership cannot manage itself');
    const manager = await this.memberships
      .findOne({ _id: managerId, organizationId })
      .session(session)
      .exec();
    if (!manager || !isMembershipActive(manager))
      throw new BadRequestException(
        'Manager must be active in the same organization',
      );
  }
}
