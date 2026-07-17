import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  SPACE_ROLES,
  SpaceRole,
} from '@/common/constants/space-role.constants';
import {
  OrganizationMembership,
  OrganizationMembershipDocument,
} from '@/modules/organizations/schemas/organization-membership.schema';
import { Workspace, WorkspaceDocument } from '../schemas/workspace.schema';
import {
  WorkspaceMembership,
  WorkspaceMembershipDocument,
} from '../schemas/workspace-membership.schema';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { AuditLogService } from '@/modules/audit/services/audit-log.service';

export type WorkspaceMembershipMode = 'legacy' | 'dual_write' | 'shadow_read';
type ActiveInput = {
  workspaceId: string;
  userId: string;
  role: SpaceRole;
  actorId?: string;
  source?: 'direct' | 'invitation';
};

@Injectable()
export class WorkspaceMembershipDualWriteService {
  constructor(
    private readonly config: ConfigService,
    private readonly legacy: WorkspacesRepository,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Workspace.name)
    private readonly workspaces: Model<WorkspaceDocument>,
    @InjectModel(WorkspaceMembership.name)
    private readonly memberships: Model<WorkspaceMembershipDocument>,
    @InjectModel(OrganizationMembership.name)
    private readonly organizationMemberships: Model<OrganizationMembershipDocument>,
    private readonly audit: AuditLogService,
  ) {}
  mode(): WorkspaceMembershipMode {
    return (this.config.get<string>('WORKSPACE_MEMBERSHIP_MODE') ??
      'legacy') as WorkspaceMembershipMode;
  }
  private enabled(): boolean {
    return this.mode() !== 'legacy';
  }
  private async transaction<T>(
    operation: (session: import('mongoose').ClientSession) => Promise<T>,
  ): Promise<T> {
    let session: import('mongoose').ClientSession;
    try {
      session = await this.connection.startSession();
    } catch {
      throw new InternalServerErrorException(
        'DUAL_WRITE_TRANSACTION_UNAVAILABLE',
      );
    }
    try {
      session.startTransaction();
      const value = await operation(session);
      await session.commitTransaction();
      return value;
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
  private async workspaceForDualWrite(
    workspaceId: string,
    session: import('mongoose').ClientSession,
  ): Promise<WorkspaceDocument> {
    const workspace = await this.workspaces
      .findOne({ _id: workspaceId, deletedAt: null })
      .session(session)
      .exec();
    if (!workspace) throw new BadRequestException('WORKSPACE_NOT_FOUND');
    if (!workspace.organizationId)
      throw new BadRequestException('WORKSPACE_NOT_TENANT_BOUND');
    return workspace;
  }
  private async assertActiveOrganizationMembership(
    organizationId: Types.ObjectId,
    userId: string,
    session: import('mongoose').ClientSession,
  ): Promise<OrganizationMembershipDocument> {
    const membership = await this.organizationMemberships
      .findOne({
        organizationId,
        userId: new Types.ObjectId(userId),
        status: 'active',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      })
      .session(session)
      .exec();
    if (!membership)
      throw new BadRequestException('ORGANIZATION_MEMBERSHIP_REQUIRED');
    return membership;
  }
  private assertRole(role: SpaceRole): void {
    if (!Object.values(SPACE_ROLES).includes(role))
      throw new BadRequestException('UNKNOWN_WORKSPACE_ROLE');
  }
  async createWorkspace(data: Partial<Workspace>): Promise<WorkspaceDocument> {
    if (!this.enabled()) return this.legacy.create(data);
    const workspace = await this.transaction(async session => {
      if (!data.organizationId || !data.ownerId)
        throw new BadRequestException('WORKSPACE_NOT_TENANT_BOUND');
      const organizationId = data.organizationId;
      await this.assertActiveOrganizationMembership(
        organizationId,
        data.ownerId.toString(),
        session,
      );
      const workspace = new this.workspaces(data);
      await workspace.save({ session });
      const now = new Date();
      await this.memberships
        .findOneAndUpdate(
          { workspaceId: workspace._id, userId: workspace.ownerId },
          {
            $set: {
              organizationId,
              role: SPACE_ROLES.WORKSPACE_ADMIN,
              status: 'active',
              source: 'owner',
              joinedAt: now,
              lastSyncedFromLegacyAt: now,
            },
          },
          { upsert: true, session, setDefaultsOnInsert: true },
        )
        .exec();
      return workspace;
    });
    this.audit.log({
      type: 'workspace.membership.owner_synced',
      severity: 'INFO',
      userId: workspace.ownerId.toString(),
      metadata: {
        workspaceId: workspace._id.toString(),
        organizationId: workspace.organizationId!.toString(),
      },
    });
    return workspace;
  }
  async shadowCompare(
    workspace: WorkspaceDocument,
    userId: string,
    legacyRole: string | null,
  ): Promise<void> {
    if (this.mode() !== 'shadow_read' || !workspace.organizationId) return;
    try {
      const membership = await this.memberships
        .findOne({
          workspaceId: workspace._id,
          userId: new Types.ObjectId(userId),
        })
        .lean()
        .exec();
      const newRole =
        membership?.status === 'active' &&
        (!membership.expiresAt || membership.expiresAt > new Date())
          ? membership.role
          : null;
      if (newRole !== legacyRole)
        this.audit.log({
          type: 'workspace.membership.divergence',
          severity: 'WARN',
          metadata: {
            workspaceId: workspace._id.toString(),
            userId,
            organizationId: workspace.organizationId.toString(),
            legacyRole,
            newRole,
            mode: this.mode(),
          },
        });
    } catch {
      this.audit.log({
        type: 'workspace.membership.dual_write_failed',
        severity: 'WARN',
        metadata: {
          workspaceId: workspace._id.toString(),
          userId,
          mode: this.mode(),
        },
      });
    }
  }
  async addMember(input: ActiveInput): Promise<WorkspaceDocument | null> {
    this.assertRole(input.role);
    if (!this.enabled())
      return this.legacy.addMember(input.workspaceId, input.userId, input.role);
    return this.transaction(async session => {
      const workspace = await this.workspaceForDualWrite(
        input.workspaceId,
        session,
      );
      const org = await this.assertActiveOrganizationMembership(
        workspace.organizationId!,
        input.userId,
        session,
      );
      if (
        (org.membershipType === 'guest' || org.membershipType === 'external') &&
        input.role !== SPACE_ROLES.VIEWER
      )
        throw new BadRequestException(
          'ORGANIZATION_MEMBERSHIP_INSUFFICIENT_ROLE',
        );
      const userId = new Types.ObjectId(input.userId);
      const now = new Date();
      const existing = await this.memberships
        .findOne({ workspaceId: workspace._id, userId })
        .session(session)
        .exec();
      await this.workspaces
        .updateOne(
          { _id: workspace._id },
          { $pull: { members: { userId } } },
          { session },
        )
        .exec();
      const updated = await this.workspaces
        .findByIdAndUpdate(
          workspace._id,
          { $addToSet: { members: { userId, role: input.role } } },
          { new: true, session },
        )
        .exec();
      await this.memberships
        .findOneAndUpdate(
          { workspaceId: workspace._id, userId },
          {
            $setOnInsert: { joinedAt: now },
            $set: {
              organizationId: workspace.organizationId,
              role: workspace.ownerId.equals(userId)
                ? SPACE_ROLES.WORKSPACE_ADMIN
                : input.role,
              status: 'active',
              source: workspace.ownerId.equals(userId)
                ? 'owner'
                : (input.source ?? 'direct'),
              suspendedAt: null,
              leftAt: null,
              removedAt: null,
              deletedAt: null,
              lastSyncedFromLegacyAt: now,
              ...(existing && existing.status !== 'active'
                ? { joinedAt: now }
                : {}),
            },
          },
          { upsert: true, new: true, session, setDefaultsOnInsert: true },
        )
        .exec();
      return updated;
    });
  }
  async activateInvite(input: ActiveInput): Promise<WorkspaceDocument | null> {
    return this.addMember({ ...input, source: 'invitation' });
  }
  async inviteMember(
    input: ActiveInput & { expiresAt?: Date | null },
  ): Promise<void> {
    this.assertRole(input.role);
    if (!this.enabled()) return;
    await this.transaction(async session => {
      const workspace = await this.workspaceForDualWrite(
        input.workspaceId,
        session,
      );
      const userId = new Types.ObjectId(input.userId);
      const existing = await this.memberships
        .findOne({ workspaceId: workspace._id, userId })
        .session(session)
        .exec();
      if (existing?.status === 'active') return;
      await this.memberships
        .findOneAndUpdate(
          { workspaceId: workspace._id, userId },
          {
            $set: {
              organizationId: workspace.organizationId,
              role: workspace.ownerId.equals(userId)
                ? SPACE_ROLES.WORKSPACE_ADMIN
                : input.role,
              status: 'invited',
              source: 'invitation',
              invitedBy: input.actorId
                ? new Types.ObjectId(input.actorId)
                : null,
              expiresAt: input.expiresAt ?? null,
              lastSyncedFromLegacyAt: new Date(),
            },
          },
          { upsert: true, session, setDefaultsOnInsert: true },
        )
        .exec();
    });
  }
  async changeRole(
    workspaceId: string,
    userId: string,
    role: SpaceRole,
  ): Promise<WorkspaceDocument | null> {
    this.assertRole(role);
    if (!this.enabled())
      return this.legacy.updateMemberRole(workspaceId, userId, role);
    return this.transaction(async session => {
      const workspace = await this.workspaceForDualWrite(workspaceId, session);
      const memberId = new Types.ObjectId(userId);
      const organizationMembership =
        await this.assertActiveOrganizationMembership(
          workspace.organizationId!,
          userId,
          session,
        );
      if (
        (organizationMembership.membershipType === 'guest' ||
          organizationMembership.membershipType === 'external') &&
        role !== SPACE_ROLES.VIEWER
      )
        throw new BadRequestException(
          'ORGANIZATION_MEMBERSHIP_INSUFFICIENT_ROLE',
        );
      if (
        workspace.ownerId.equals(memberId) &&
        role !== SPACE_ROLES.WORKSPACE_ADMIN
      )
        throw new BadRequestException('WORKSPACE_OWNER_ROLE_IMMUTABLE');
      const updated = await this.workspaces
        .findOneAndUpdate(
          { _id: workspace._id, 'members.userId': memberId },
          { $set: { 'members.$.role': role } },
          { new: true, session },
        )
        .exec();
      if (!updated) throw new BadRequestException('WORKSPACE_MEMBER_NOT_FOUND');
      await this.memberships
        .findOneAndUpdate(
          { workspaceId: workspace._id, userId: memberId },
          { $set: { role, lastSyncedFromLegacyAt: new Date() } },
          { new: true, session },
        )
        .exec();
      return updated;
    });
  }
  async removeMember(
    workspaceId: string,
    userId: string,
    status: 'removed' | 'left' = 'removed',
  ): Promise<WorkspaceDocument | null> {
    if (!this.enabled()) return this.legacy.removeMember(workspaceId, userId);
    return this.transaction(async session => {
      const workspace = await this.workspaceForDualWrite(workspaceId, session);
      const memberId = new Types.ObjectId(userId);
      if (workspace.ownerId.equals(memberId))
        throw new BadRequestException('WORKSPACE_OWNER_CANNOT_BE_REMOVED');
      const legacyMember = workspace.members.find(member =>
        member.userId.equals(memberId),
      );
      const updated = await this.workspaces
        .findByIdAndUpdate(
          workspace._id,
          { $pull: { members: { userId: memberId } } },
          { new: true, session },
        )
        .exec();
      const now = new Date();
      await this.memberships
        .findOneAndUpdate(
          { workspaceId: workspace._id, userId: memberId },
          {
            $set: {
              organizationId: workspace.organizationId,
              role: legacyMember?.role,
              status,
              removedAt: status === 'removed' ? now : null,
              leftAt: status === 'left' ? now : null,
              lastSyncedFromLegacyAt: now,
            },
          },
          { new: true, upsert: true, session, setDefaultsOnInsert: true },
        )
        .exec();
      return updated;
    });
  }
  async syncOwnerMembership(workspaceId: string): Promise<void> {
    if (!this.enabled()) return;
    await this.transaction(async session => {
      const workspace = await this.workspaceForDualWrite(workspaceId, session);
      await this.assertActiveOrganizationMembership(
        workspace.organizationId!,
        workspace.ownerId.toString(),
        session,
      );
      const now = new Date();
      await this.memberships
        .findOneAndUpdate(
          { workspaceId: workspace._id, userId: workspace.ownerId },
          {
            $set: {
              organizationId: workspace.organizationId,
              role: SPACE_ROLES.WORKSPACE_ADMIN,
              status: 'active',
              source: 'owner',
              joinedAt: now,
              lastSyncedFromLegacyAt: now,
            },
          },
          { upsert: true, session, setDefaultsOnInsert: true },
        )
        .exec();
    });
  }
}
