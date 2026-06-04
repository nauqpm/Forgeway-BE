import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { v4 as uuidv4 } from 'uuid';
import { InviteRepository } from '../repositories/invite.repository';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { CreateInviteDto } from '../dtos/create-invite.dto';
import { Invite, INVITE_STATUS } from '../schemas/invite.schema';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';
import { UsersService } from '@/modules/users/services/users.service';
import {
  WorkspaceInviteCreatedEvent,
  WorkspaceInviteSummaryPayload,
  WorkspaceMemberJoinedEvent,
  WorkspaceSummaryPayload,
} from '@/shared/events/domain-events/workspace';

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly inviteRepository: InviteRepository,
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createInvite(
    workspaceId: string,
    invitedByUserId: string,
    dto: CreateInviteDto,
  ): Promise<Invite> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');

    const normalizedEmail = dto.email.toLowerCase();

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      const isMember = workspace.members.some(
        (m) => m.userId.toString() === existingUser._id.toString(),
      );
      if (isMember) throw new ConflictException('User is already a member of this workspace');
    }

    const pendingInvite = await this.inviteRepository.findPendingByEmailAndWorkspace(
      normalizedEmail,
      workspaceId,
    );
    if (pendingInvite) throw new ConflictException('Invite already pending for this email');

    const token = uuidv4();
    const role = dto.role ?? SPACE_ROLES.MEMBER;

    const invite = await this.inviteRepository.create({
      workspaceId: (workspace as any)._id,
      invitedEmail: normalizedEmail,
      invitedBy: invitedByUserId as any,
      role,
      token,
      status: INVITE_STATUS.PENDING,
    });

    this.publishWorkspaceInviteCreatedEvent(
      workspace,
      invite,
      normalizedEmail,
      role,
      invitedByUserId,
      existingUser?._id?.toString(),
    );

    await this.notifyExistingUserInvited(
      existingUser,
      workspace,
      invite,
      invitedByUserId,
      role,
    );

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const acceptUrl = `${frontendUrl}/invites/accept/${token}`;

    this.logger.log(`[sendInvite] to=${normalizedEmail} workspace="${workspace.name}" frontendUrl=${frontendUrl} acceptUrl=${acceptUrl}`);

    this.mailerService
      .sendMail({
        to: normalizedEmail,
        subject: `Bạn được mời tham gia workspace "${workspace.name}"`,
        template: './workspace-invite',
        context: {
          workspaceName: workspace.name,
          role,
          acceptUrl,
        },
      })
      .then(() => this.logger.log(`[sendInvite] email sent OK → ${normalizedEmail}`))
      .catch((err) => this.logger.error(`[sendInvite] email FAILED → ${normalizedEmail}`, err?.message));

    return invite;
  }

  async getInvites(workspaceId: string): Promise<Invite[]> {
    return this.inviteRepository.findPendingByWorkspace(workspaceId);
  }

  async cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
    const invite = await this.inviteRepository.findById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Invite does not belong to this workspace');
    }

    await this.inviteRepository.updateStatus(inviteId, INVITE_STATUS.EXPIRED);
  }

  async acceptInvite(token: string, userId: string, userEmail: string): Promise<void> {
    const invite = await this.inviteRepository.findByToken(token);
    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.status !== INVITE_STATUS.PENDING || (invite.expiresAt && invite.expiresAt < new Date())) {
      throw new GoneException('Invite has expired or already been used');
    }

    if (invite.invitedEmail !== userEmail.toLowerCase()) {
      throw new ForbiddenException('This invite was sent to a different email address');
    }

    const workspace = await this.workspacesRepository.findById(invite.workspaceId.toString());
    if (!workspace) throw new NotFoundException('Workspace not found');

    const alreadyMember = workspace.members.some((m) => m.userId.toString() === userId);
    if (alreadyMember) throw new ConflictException('You are already a member of this workspace');

    await this.workspacesRepository.addMember(invite.workspaceId.toString(), userId, invite.role);
    await this.inviteRepository.updateStatus((invite as any)._id.toString(), INVITE_STATUS.ACCEPTED);
    this.publishWorkspaceMemberJoinedEvent(workspace, userId, invite.role, userId);
  }

  async getInviteByToken(token: string): Promise<{
    workspaceId: string;
    workspaceName: string;
    workspaceKey: string;
    invitedEmail: string;
    invitedBy: any;
    role: string;
    status: string;
    expiresAt: Date | null;
  }> {
    const invite = await this.inviteRepository.findByToken(token);
    if (!invite) throw new NotFoundException('Invite not found');

    const workspace = await this.workspacesRepository.findById(invite.workspaceId.toString());

    return {
      workspaceId: invite.workspaceId.toString(),
      workspaceName: workspace?.name ?? '',
      workspaceKey: (workspace as any)?.key ?? '',
      invitedEmail: invite.invitedEmail,
      invitedBy: (invite as any).invitedBy,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt ?? null,
    };
  }

  async processPostRegisterInvites(email: string, userId: string): Promise<void> {
    const pendingInvites = await this.inviteRepository.findPendingValidByEmail(email);
    await Promise.all(
      pendingInvites.map(async (invite) => {
        const workspace = await this.workspacesRepository.findById(
          invite.workspaceId.toString(),
        );
        await this.workspacesRepository.addMember(
          invite.workspaceId.toString(),
          userId,
          invite.role,
        );
        await this.inviteRepository.updateStatus(
          (invite as any)._id.toString(),
          INVITE_STATUS.ACCEPTED,
        );
        if (workspace) {
          this.publishWorkspaceMemberJoinedEvent(workspace, userId, invite.role, userId);
        }
      }),
    );
  }
  private publishWorkspaceInviteCreatedEvent(
    workspace: any,
    invite: Invite,
    recipientEmail: string,
    role: string,
    actorId: string,
    recipientId?: string,
  ): void {
    const event = new WorkspaceInviteCreatedEvent({
      workspaceId: workspace._id.toString(),
      actorId,
      inviteId: (invite as any)._id.toString(),
      recipientEmail,
      recipientId,
      role,
      workspace: this.toWorkspaceSummary(workspace),
      invite: this.toInviteSummary(invite),
    });

    this.eventEmitter.emit(event.type, event);
  }

  private publishWorkspaceMemberJoinedEvent(
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

  private toInviteSummary(invite: Invite): WorkspaceInviteSummaryPayload {
    return {
      id: (invite as any)._id.toString(),
      workspaceId: invite.workspaceId.toString(),
      invitedEmail: invite.invitedEmail,
      invitedBy: invite.invitedBy.toString(),
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt ?? null,
      createdAt: (invite as any).createdAt,
      updatedAt: (invite as any).updatedAt,
    };
  }
  private async notifyExistingUserInvited(
    invitedUser: any,
    workspace: any,
    invite: Invite,
    invitedByUserId: string,
    role: string,
  ): Promise<void> {
    if (!invitedUser || invitedUser._id.toString() === invitedByUserId) {
      return;
    }

    try {
      await this.notificationsService.notifyWorkspaceInvited({
        recipientId: invitedUser._id.toString(),
        actorId: invitedByUserId,
        workspaceId: workspace._id.toString(),
        workspaceName: workspace.name,
        inviteId: (invite as any)._id.toString(),
        role,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create workspace invite notification: ${message}`);
    }
  }
}
