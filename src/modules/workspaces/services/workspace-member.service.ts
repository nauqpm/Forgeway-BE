import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import {
  SPACE_ROLES,
  SpaceRole,
} from '../../../common/constants/space-role.constants';
import { ErrorFactory } from '../../../common/factories/error.factory';
import { UsersService } from '../../users/services/users.service';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import {
  WorkspaceMemberJoinedEvent,
  WorkspaceMemberRemovedEvent,
  WorkspaceMemberRoleUpdatedEvent,
  WorkspaceSummaryPayload,
} from '../../../shared/events/domain-events/workspace';

@Injectable()
export class WorkspaceMemberService {
  private readonly logger = new Logger(WorkspaceMemberService.name);

  constructor(
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async addMember(
    workspaceId: string,
    email: string,
    role: SpaceRole,
    actorId?: string,
  ): Promise<any> {
    this.logger.log(`Adding member ${email} to workspace ${workspaceId}`);
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(workspaceId));
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(ErrorFactory.userNotFound(email));
    }

    const userId = user._id.toString();
    const isAlreadyMember = workspace.members.some(
      member => member.userId.toString() === userId,
    );
    if (isAlreadyMember) {
      throw new BadRequestException(
        `User with email "${email}" is already a member`,
      );
    }

    const updated = await this.workspacesRepository.addMember(
      workspaceId,
      userId,
      role,
    );
    this.publishMemberJoinedEvent(workspace, userId, role, actorId);
    this.logger.log(
      `Added member ${email} to workspace ${workspaceId} as ${role}`,
    );
    return updated;
  }

  async removeMember(
    workspaceId: string,
    userId: string,
    actorId?: string,
  ): Promise<any> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(workspaceId));
    }

    const member = workspace.members.find(
      item => item.userId.toString() === userId,
    );
    if (!member) {
      throw new NotFoundException(ErrorFactory.workspaceMemberNotFound(userId));
    }

    if (workspace.ownerId.toString() === userId) {
      throw new ForbiddenException('Cannot remove workspace owner');
    }

    this.ensureNotLastAdmin(workspace, userId);

    const updated = await this.workspacesRepository.removeMember(
      workspaceId,
      userId,
    );
    this.publishMemberRemovedEvent(workspace, userId, member.role, actorId);
    this.logger.log(`Member ${userId} removed from workspace ${workspaceId}`);
    return updated;
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: SpaceRole,
    actorId?: string,
  ): Promise<any> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(workspaceId));
    }

    const member = workspace.members.find(
      item => item.userId.toString() === userId,
    );
    if (!member) {
      throw new NotFoundException(ErrorFactory.workspaceMemberNotFound(userId));
    }

    if (workspace.ownerId.toString() === userId) {
      throw new ForbiddenException('Cannot change owner role');
    }

    if (
      member.role === SPACE_ROLES.WORKSPACE_ADMIN &&
      role !== SPACE_ROLES.WORKSPACE_ADMIN
    ) {
      this.ensureNotLastAdmin(workspace, userId);
    }

    const previousRole = member.role;
    const updated = await this.workspacesRepository.updateMemberRole(
      workspaceId,
      userId,
      role,
    );
    this.publishMemberRoleUpdatedEvent(
      workspace,
      userId,
      previousRole,
      role,
      actorId,
    );
    this.logger.log(
      `Member ${userId} role updated to ${role} in workspace ${workspaceId}`,
    );
    return updated;
  }

  async getMembers(workspaceId: string): Promise<any[]> {
    const workspace =
      await this.workspacesRepository.findByIdWithMembers(workspaceId);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(workspaceId));
    }
    return workspace.members;
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) return false;
    return workspace.members.some(
      member => member.userId.toString() === userId,
    );
  }

  async getMemberRole(
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) return null;
    const member = workspace.members.find(m => m.userId.toString() === userId);
    return member ? member.role : null;
  }

  /**
   * Fetch the workspace once and return a Set of member userId strings.
   * Use this to batch-check membership for multiple users in a single query.
   */
  async getMemberIdsSet(workspaceId: string): Promise<Set<string>> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) return new Set();
    return new Set(workspace.members.map(m => m.userId.toString()));
  }

  /**
   * Filter an array of user IDs to only those who are workspace members.
   * Uses a single query (fetch workspace once) instead of N queries.
   */
  async filterMembers(
    workspaceId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const memberIds = await this.getMemberIdsSet(workspaceId);
    return userIds.filter(id => memberIds.has(id));
  }

  /**
   * Return the subset of user IDs that are NOT workspace members.
   * Uses a single query (fetch workspace once) instead of N queries.
   */
  async filterNonMembers(
    workspaceId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const memberIds = await this.getMemberIdsSet(workspaceId);
    return userIds.filter(id => !memberIds.has(id));
  }

  private ensureNotLastAdmin(workspace: any, userId: string): void {
    const adminCount = workspace.members.filter(
      (member: any) => member.role === SPACE_ROLES.WORKSPACE_ADMIN,
    ).length;
    const isTargetAdmin = workspace.members.some(
      (member: any) =>
        member.userId.toString() === userId &&
        member.role === SPACE_ROLES.WORKSPACE_ADMIN,
    );

    if (adminCount === 1 && isTargetAdmin) {
      throw new BadRequestException(
        'Cannot remove or demote the last workspace admin',
      );
    }
  }

  private publishMemberJoinedEvent(
    workspace: any,
    userId: string,
    role: string,
    actorId?: string,
  ): void {
    const event = new WorkspaceMemberJoinedEvent({
      workspaceId: workspace._id.toString(),
      actorId,
      userId,
      role,
      workspace: this.toWorkspaceSummary(workspace),
      member: { userId, role },
    });

    this.eventEmitter.emit(event.type, event);
  }

  private publishMemberRemovedEvent(
    workspace: any,
    userId: string,
    previousRole?: string,
    actorId?: string,
  ): void {
    const event = new WorkspaceMemberRemovedEvent({
      workspaceId: workspace._id.toString(),
      actorId,
      userId,
      previousRole,
      workspace: this.toWorkspaceSummary(workspace),
    });

    this.eventEmitter.emit(event.type, event);
  }

  private publishMemberRoleUpdatedEvent(
    workspace: any,
    userId: string,
    previousRole: string,
    nextRole: string,
    actorId?: string,
  ): void {
    const event = new WorkspaceMemberRoleUpdatedEvent({
      workspaceId: workspace._id.toString(),
      actorId,
      userId,
      previousRole,
      nextRole,
      workspace: this.toWorkspaceSummary(workspace),
      member: { userId, role: nextRole },
    });

    this.eventEmitter.emit(event.type, event);
  }

  private toWorkspaceSummary(workspace: any): WorkspaceSummaryPayload {
    return {
      id: workspace._id.toString(),
      key: workspace.key,
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      status: workspace.status,
      access: workspace.access,
    };
  }

  @OnEvent('user.deleted', { async: true })
  async handleUserDeleted(event: { userId: string }): Promise<void> {
    const { userId } = event;
    if (userId && Types.ObjectId.isValid(userId)) {
      this.logger.log(
        `Cascade: User deleted event received. Cleaning up user ${userId} from all workspaces`,
      );
      try {
        await this.workspacesRepository.model.updateMany(
          {},
          { $pull: { members: { userId: new Types.ObjectId(userId) } } },
        );
      } catch (err) {
        this.logger.error(
          `Failed to clean up workspaces for deleted user: ${err.message}`,
          err.stack,
        );
      }
    }
  }
}
