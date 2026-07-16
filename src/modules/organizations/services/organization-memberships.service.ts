import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditLogService } from '@/modules/audit/services/audit-log.service';
import { ORGANIZATION_AUDIT_EVENTS } from '@/modules/audit/constants/audit.constants';
import {
  MembershipType,
  OrganizationRole,
} from '../constants/organization.constants';
import {
  defaultRoleForMembershipType,
  isElevatedGuestRole,
  isMembershipActive,
} from '../policies/organization-membership.policy';
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
export class OrganizationMembershipsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<OrganizationDocument>,
    @InjectModel(OrganizationMembership.name)
    private readonly memberships: Model<OrganizationMembershipDocument>,
    private readonly transactions: OrganizationTransactionService,
    private readonly profiles: EmployeeProfilesService,
    private readonly audit: AuditLogService,
  ) {}

  async invite(input: {
    organizationId: string;
    userId: string;
    invitedBy: string;
    membershipType: MembershipType;
    expiresAt?: Date | null;
    role?: OrganizationRole;
  }): Promise<OrganizationMembership> {
    return this.inviteInternal(input, false);
  }

  async inviteWithElevatedRole(input: {
    organizationId: string;
    userId: string;
    invitedBy: string;
    membershipType: MembershipType;
    expiresAt?: Date | null;
    role: OrganizationRole;
  }): Promise<OrganizationMembership> {
    return this.inviteInternal(input, true);
  }

  private async inviteInternal(
    input: {
      organizationId: string;
      userId: string;
      invitedBy: string;
      membershipType: MembershipType;
      expiresAt?: Date | null;
      role?: OrganizationRole;
    },
    allowElevatedRole: boolean,
  ): Promise<OrganizationMembership> {
    if (input.membershipType === 'guest' && !input.expiresAt)
      throw new BadRequestException('Guest invitations require an expiry');
    const role =
      input.role ?? defaultRoleForMembershipType(input.membershipType);
    if (isElevatedGuestRole(input.membershipType, role) && !allowElevatedRole)
      throw new ForbiddenException(
        'Elevated guest roles require the privileged lifecycle path',
      );
    const result = await this.transactions.run(async session => {
      await this.lockOrganization(input.organizationId, session);
      const existing = await this.memberships
        .findOne({ organizationId: input.organizationId, userId: input.userId })
        .session(session)
        .exec();
      const update = {
        role,
        membershipType: input.membershipType,
        status: 'invited' as const,
        invitedBy: new Types.ObjectId(input.invitedBy),
        expiresAt: input.expiresAt ?? null,
        joinedAt: null,
        suspendedAt: null,
        leftAt: null,
        removedAt: null,
      };
      if (existing) {
        Object.assign(existing, update);
        return existing.save({ session });
      }
      const [membership] = await this.memberships.create(
        [
          {
            ...update,
            organizationId: new Types.ObjectId(input.organizationId),
            userId: new Types.ObjectId(input.userId),
          },
        ],
        { session },
      );
      return membership;
    });
    this.log(
      ORGANIZATION_AUDIT_EVENTS.MEMBERSHIP_INVITED,
      input.invitedBy,
      result,
      { expiresAt: result.expiresAt ?? null },
    );
    if (input.membershipType === 'guest') {
      this.log(
        ORGANIZATION_AUDIT_EVENTS.GUEST_EXPIRY_CONFIGURED,
        input.invitedBy,
        result,
        { expiresAt: result.expiresAt },
      );
    }
    if (isElevatedGuestRole(input.membershipType, role))
      this.log(
        ORGANIZATION_AUDIT_EVENTS.ELEVATED_GUEST_ROLE_ASSIGNED,
        input.invitedBy,
        result,
      );
    return result;
  }

  async accept(
    membershipId: string,
    userId: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.transactions.run(async session => {
      const membership = await this.findMembership(membershipId, session);
      if (!membership.userId.equals(userId))
        throw new ForbiddenException(
          'Invitation identity does not match membership',
        );
      if (membership.status !== 'invited')
        throw new ConflictException('Membership is not awaiting acceptance');
      if (membership.expiresAt && membership.expiresAt <= new Date())
        throw new ForbiddenException('Membership invitation has expired');
      const organization = await this.lockOrganization(
        membership.organizationId.toString(),
        session,
      );
      membership.status = 'active';
      membership.joinedAt = new Date();
      await membership.save({ session });
      await this.profiles.createForMembershipIfRequired(
        membership,
        organization.settings,
        session,
      );
      return membership;
    });
    this.log(ORGANIZATION_AUDIT_EVENTS.MEMBERSHIP_ACCEPTED, userId, membership);
    return membership;
  }

  async suspendMembership(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    return this.deactivate(membershipId, actorId, 'suspended');
  }
  async removeMembership(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    return this.deactivate(membershipId, actorId, 'removed');
  }
  async leaveOrganization(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    return this.deactivate(membershipId, actorId, 'left');
  }

  async reactivate(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.transactions.run(async session => {
      const membership = await this.findMembership(membershipId, session);
      if (!['suspended', 'left', 'removed'].includes(membership.status))
        throw new BadRequestException(
          'Membership cannot be reactivated from its current status',
        );
      await this.lockOrganization(
        membership.organizationId.toString(),
        session,
      );
      membership.status = 'active';
      membership.joinedAt ??= new Date();
      membership.suspendedAt = null;
      membership.leftAt = null;
      membership.removedAt = null;
      return membership.save({ session });
    });
    this.log(
      ORGANIZATION_AUDIT_EVENTS.MEMBERSHIP_REACTIVATED,
      actorId,
      membership,
    );
    return membership;
  }

  async promoteToOwner(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    return this.promoteToOwnerInternal(membershipId, actorId, false);
  }

  async promoteGuestToOwner(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    return this.promoteToOwnerInternal(membershipId, actorId, true);
  }

  private async promoteToOwnerInternal(
    membershipId: string,
    actorId: string,
    allowElevatedRole: boolean,
  ): Promise<OrganizationMembership> {
    const membership = await this.transactions.run(async session => {
      const membership = await this.findMembership(membershipId, session);
      if (!isMembershipActive(membership))
        throw new BadRequestException(
          'Only active memberships can become owners',
        );
      if (
        isElevatedGuestRole(membership.membershipType, 'owner') &&
        !allowElevatedRole
      )
        throw new ForbiddenException(
          'Elevated guest roles require the privileged lifecycle path',
        );
      await this.lockOrganization(
        membership.organizationId.toString(),
        session,
      );
      membership.role = 'owner';
      return membership.save({ session });
    });
    this.log(ORGANIZATION_AUDIT_EVENTS.OWNER_PROMOTED, actorId, membership);
    return membership;
  }

  async demoteOwner(
    membershipId: string,
    actorId: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.transactions.run(async session => {
      const membership = await this.findMembership(membershipId, session);
      await this.lockOrganization(
        membership.organizationId.toString(),
        session,
      );
      await this.assertNotLastActiveOwner(membership, session);
      membership.role = defaultRoleForMembershipType(membership.membershipType);
      return membership.save({ session });
    });
    this.log(ORGANIZATION_AUDIT_EVENTS.OWNER_DEMOTED, actorId, membership);
    return membership;
  }

  async transferOwnership(
    sourceId: string,
    targetId: string,
    actorId: string,
  ): Promise<void> {
    await this.transactions.run(async session => {
      const source = await this.findMembership(sourceId, session);
      const target = await this.findMembership(targetId, session);
      if (!source.organizationId.equals(target.organizationId))
        throw new BadRequestException(
          'Ownership transfer must stay within one organization',
        );
      if (source.role !== 'owner')
        throw new BadRequestException(
          'Ownership transfer source must be an owner',
        );
      if (!isMembershipActive(target))
        throw new BadRequestException(
          'Ownership target must be active and unexpired',
        );
      await this.lockOrganization(source.organizationId.toString(), session);
      target.role = 'owner';
      await target.save({ session });
      await this.assertNotLastActiveOwner(source, session);
      source.role = defaultRoleForMembershipType(source.membershipType);
      await source.save({ session });
    });
    this.audit.log({
      type: ORGANIZATION_AUDIT_EVENTS.OWNERSHIP_TRANSFERRED,
      severity: 'INFO',
      userId: actorId,
      metadata: { sourceId, targetId },
    });
  }

  private async deactivate(
    membershipId: string,
    actorId: string,
    status: 'suspended' | 'removed' | 'left',
  ): Promise<OrganizationMembership> {
    const membership = await this.transactions.run(async session => {
      const membership = await this.findMembership(membershipId, session);
      await this.lockOrganization(
        membership.organizationId.toString(),
        session,
      );
      await this.assertNotLastActiveOwner(membership, session);
      membership.status = status;
      if (status === 'suspended') membership.suspendedAt = new Date();
      if (status === 'removed') membership.removedAt = new Date();
      if (status === 'left') membership.leftAt = new Date();
      return membership.save({ session });
    });
    const event =
      status === 'suspended'
        ? ORGANIZATION_AUDIT_EVENTS.MEMBERSHIP_SUSPENDED
        : ORGANIZATION_AUDIT_EVENTS.MEMBERSHIP_REMOVED;
    this.log(event, actorId, membership);
    return membership;
  }

  private async lockOrganization(
    organizationId: string,
    session: ClientSession,
  ): Promise<Organization> {
    const organization = await this.organizations
      .findOneAndUpdate(
        { _id: organizationId, deletedAt: null },
        { $inc: { lifecycleVersion: 1 } },
        { new: true, session },
      )
      .exec();
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  private async findMembership(
    membershipId: string,
    session: ClientSession,
  ): Promise<OrganizationMembershipDocument> {
    if (!Types.ObjectId.isValid(membershipId))
      throw new BadRequestException('Invalid organization membership id');
    const membership = await this.memberships
      .findById(membershipId)
      .session(session)
      .exec();
    if (!membership)
      throw new NotFoundException('Organization membership not found');
    return membership;
  }

  private async assertNotLastActiveOwner(
    membership: OrganizationMembershipDocument,
    session: ClientSession,
  ): Promise<void> {
    if (membership.role !== 'owner' || !isMembershipActive(membership)) return;
    const count = await this.memberships
      .countDocuments({
        organizationId: membership.organizationId,
        role: 'owner',
        status: 'active',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      })
      .session(session)
      .exec();
    if (count <= 1) {
      this.audit.log({
        type: ORGANIZATION_AUDIT_EVENTS.INVARIANT_REJECTED,
        severity: 'WARN',
        userId: membership.userId.toString(),
        metadata: {
          organizationId: membership.organizationId.toString(),
          membershipId: membership._id.toString(),
        },
      });
      throw new ConflictException(
        'Organization must retain at least one active owner',
      );
    }
  }

  private log(
    type: (typeof ORGANIZATION_AUDIT_EVENTS)[keyof typeof ORGANIZATION_AUDIT_EVENTS],
    actorId: string,
    membership: OrganizationMembershipDocument,
    metadata: Record<string, unknown> = {},
  ): void {
    this.audit.log({
      type,
      severity: 'INFO',
      userId: actorId,
      metadata: {
        organizationId: membership.organizationId.toString(),
        membershipId: membership._id.toString(),
        ...metadata,
      },
    });
  }
}
