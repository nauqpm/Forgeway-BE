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
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { InviteRepository } from '../repositories/invite.repository';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { CreateInviteDto } from '../dtos/create-invite.dto';
import { CreateInviteLinkDto } from '../dtos/create-invite-link.dto';
import { Invite, INVITE_STATUS, INVITE_TYPES } from '../schemas/invite.schema';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { ErrorFactory } from '../../../common/factories/error.factory';
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
  private readonly inviteLinkTtlMs = 10 * 60 * 1000;

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
    if (!workspace)
      throw new NotFoundException(ErrorFactory.workspaceNotFound(workspaceId));

    const normalizedEmail = dto.email.toLowerCase();

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      const isMember = workspace.members.some(
        m => m.userId.toString() === existingUser._id.toString(),
      );
      if (isMember)
        throw new ConflictException(ErrorFactory.memberAlreadyExists());
    }

    const pendingInvite =
      await this.inviteRepository.findPendingByEmailAndWorkspace(
        normalizedEmail,
        workspaceId,
      );
    if (pendingInvite)
      throw new ConflictException(ErrorFactory.inviteAlreadyPending());

    const token = uuidv4();
    const role = dto.role ?? SPACE_ROLES.MEMBER;

    const invite = await this.inviteRepository.create({
      workspaceId: (workspace as any)._id,
      invitedEmail: normalizedEmail,
      invitedBy: invitedByUserId as any,
      role,
      token,
      type: INVITE_TYPES.EMAIL,
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

    this.logger.log(
      `[sendInvite] to=${normalizedEmail} workspace="${workspace.name}" frontendUrl=${frontendUrl} acceptUrl=${acceptUrl}`,
    );

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
      .then(() =>
        this.logger.log(`[sendInvite] email sent OK → ${normalizedEmail}`),
      )
      .catch(err =>
        this.logger.error(
          `[sendInvite] email FAILED → ${normalizedEmail}`,
          err?.message,
        ),
      );

    return invite;
  }

  async createInviteLink(
    workspaceId: string,
    invitedByUserId: string,
    dto: CreateInviteLinkDto,
  ): Promise<Invite & { inviteUrl: string }> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace)
      throw new NotFoundException(ErrorFactory.workspaceNotFound(workspaceId));

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + this.inviteLinkTtlMs);

    const invite = await this.inviteRepository.create({
      workspaceId: (workspace as any)._id,
      invitedEmail: null,
      invitedBy: invitedByUserId as any,
      role: dto.role,
      token,
      type: INVITE_TYPES.LINK,
      status: INVITE_STATUS.PENDING,
      expiresAt,
      acceptedBy: [],
    });

    return {
      ...(invite as any),
      inviteUrl: this.buildAcceptUrl(token),
    };
  }

  async getInvites(workspaceId: string): Promise<Invite[]> {
    return this.inviteRepository.findPendingByWorkspace(workspaceId);
  }

  async cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
    const invite = await this.inviteRepository.findById(inviteId);
    if (!invite) throw new NotFoundException(ErrorFactory.inviteNotFound());

    if (invite.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException(ErrorFactory.inviteWorkspaceMismatch());
    }

    await this.inviteRepository.updateStatus(inviteId, INVITE_STATUS.EXPIRED);
  }

  async acceptInvite(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<void> {
    const invite = await this.inviteRepository.findByToken(token);
    if (!invite) throw new NotFoundException(ErrorFactory.inviteNotFound());

    await this.acceptInviteRecord(invite, userId, userEmail, {
      allowLinkInvite: true,
    });
  }

  async acceptInviteByIdForUser(
    inviteId: string,
    userId: string,
    userEmail: string,
  ): Promise<void> {
    const invite = await this.findInviteByIdOrThrow(inviteId);
    await this.acceptInviteRecord(invite, userId, userEmail);
  }

  async declineInviteByIdForUser(
    inviteId: string,
    userId: string,
    userEmail: string,
  ): Promise<void> {
    const invite = await this.findInviteByIdOrThrow(inviteId);
    this.assertInviteCanBeActioned(invite);
    this.assertInviteRecipient(invite, userId, userEmail);

    await this.inviteRepository.updateStatus(
      (invite as any)._id.toString(),
      INVITE_STATUS.DECLINED,
    );
  }

  async getInviteByToken(token: string): Promise<{
    workspaceId: string;
    workspaceName: string;
    workspaceKey: string;
    invitedEmail: string | null;
    invitedBy: any;
    role: string;
    type: string;
    status: string;
    expiresAt: Date | null;
  }> {
    const invite = await this.inviteRepository.findByToken(token);
    if (!invite) throw new NotFoundException(ErrorFactory.inviteNotFound());

    const workspace = await this.workspacesRepository.findById(
      invite.workspaceId.toString(),
    );

    return {
      workspaceId: invite.workspaceId.toString(),
      workspaceName: workspace?.name ?? '',
      workspaceKey: (workspace as any)?.key ?? '',
      invitedEmail: invite.invitedEmail ?? null,
      invitedBy: (invite as any).invitedBy,
      role: invite.role,
      type: (invite as any).type ?? INVITE_TYPES.EMAIL,
      status: invite.status,
      expiresAt: invite.expiresAt ?? null,
    };
  }

  async getInviteByIdForUser(
    inviteId: string,
    userId: string,
    userEmail: string,
  ): Promise<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    workspaceKey: string;
    invitedEmail: string | null;
    invitedBy: any;
    role: string;
    type: string;
    status: string;
    expiresAt: Date | null;
  }> {
    if (!Types.ObjectId.isValid(inviteId)) {
      throw new BadRequestException('Invalid invite id');
    }

    const invite = await this.inviteRepository.findByIdWithInviter(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    const inviteType = (invite as any).type ?? INVITE_TYPES.EMAIL;
    const normalizedEmail = userEmail.toLowerCase();

    if (
      inviteType === INVITE_TYPES.EMAIL &&
      invite.invitedEmail !== normalizedEmail
    ) {
      throw new ForbiddenException(
        'This invite was sent to a different email address',
      );
    }

    if (inviteType === INVITE_TYPES.LINK) {
      const acceptedBy = ((invite as any).acceptedBy ?? []).map((id: any) =>
        id.toString(),
      );
      if (!acceptedBy.includes(userId)) {
        throw new ForbiddenException(
          'This invite is not available for this user',
        );
      }
    }

    const workspace = await this.workspacesRepository.findById(
      invite.workspaceId.toString(),
    );
    if (!workspace) throw new NotFoundException('Workspace not found');

    return {
      id: (invite as any)._id.toString(),
      workspaceId: invite.workspaceId.toString(),
      workspaceName: workspace.name,
      workspaceKey: (workspace as any).key ?? '',
      invitedEmail: invite.invitedEmail ?? null,
      invitedBy: (invite as any).invitedBy,
      role: invite.role,
      type: inviteType,
      status: invite.status,
      expiresAt: invite.expiresAt ?? null,
    };
  }
  async processPostRegisterInvites(
    email: string,
    userId: string,
  ): Promise<void> {
    const pendingInvites =
      await this.inviteRepository.findPendingValidByEmail(email);
    await Promise.all(
      pendingInvites.map(async invite => {
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
          this.publishWorkspaceMemberJoinedEvent(
            workspace,
            userId,
            invite.role,
            userId,
          );
        }
      }),
    );
  }

  private async findInviteByIdOrThrow(inviteId: string): Promise<Invite> {
    if (!Types.ObjectId.isValid(inviteId)) {
      throw new BadRequestException('Invalid invite id');
    }

    const invite = await this.inviteRepository.findById(inviteId);
    if (!invite) throw new NotFoundException(ErrorFactory.inviteNotFound());

    return invite;
  }

  private assertInviteCanBeActioned(invite: Invite): void {
    if (invite.status === INVITE_STATUS.ACCEPTED) {
      throw new GoneException(ErrorFactory.inviteAlreadyAccepted());
    }

    if (invite.status === INVITE_STATUS.DECLINED) {
      throw new GoneException(ErrorFactory.inviteAlreadyDeclined());
    }

    if (invite.status !== INVITE_STATUS.PENDING) {
      throw new GoneException(ErrorFactory.inviteUnavailable());
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new GoneException(ErrorFactory.inviteExpired());
    }
  }

  private assertInviteRecipient(
    invite: Invite,
    userId: string,
    userEmail: string,
  ): void {
    const inviteType = (invite as any).type ?? INVITE_TYPES.EMAIL;
    const normalizedEmail = userEmail.toLowerCase();

    if (
      inviteType === INVITE_TYPES.EMAIL &&
      invite.invitedEmail !== normalizedEmail
    ) {
      throw new ForbiddenException(
        'This invite was sent to a different email address',
      );
    }

    if (inviteType === INVITE_TYPES.LINK) {
      const acceptedBy = ((invite as any).acceptedBy ?? []).map((id: any) =>
        id.toString(),
      );
      if (!acceptedBy.includes(userId)) {
        throw new ForbiddenException(
          'This invite is not available for this user',
        );
      }
    }
  }

  private async acceptInviteRecord(
    invite: Invite,
    userId: string,
    userEmail: string,
    options: { allowLinkInvite?: boolean } = {},
  ): Promise<void> {
    this.assertInviteCanBeActioned(invite);
    const inviteType = (invite as any).type ?? INVITE_TYPES.EMAIL;
    if (inviteType !== INVITE_TYPES.LINK || !options.allowLinkInvite) {
      this.assertInviteRecipient(invite, userId, userEmail);
    }

    const workspace = await this.workspacesRepository.findById(
      invite.workspaceId.toString(),
    );
    if (!workspace)
      throw new NotFoundException(
        ErrorFactory.workspaceNotFound(invite.workspaceId.toString()),
      );

    const alreadyMember = workspace.members.some(
      m => m.userId.toString() === userId,
    );
    if (alreadyMember)
      throw new ConflictException(ErrorFactory.memberAlreadyExists());

    await this.workspacesRepository.addMember(
      invite.workspaceId.toString(),
      userId,
      invite.role,
    );
    if (inviteType === INVITE_TYPES.LINK) {
      await this.inviteRepository.addAcceptedBy(
        (invite as any)._id.toString(),
        userId,
      );
    } else {
      await this.inviteRepository.updateStatus(
        (invite as any)._id.toString(),
        INVITE_STATUS.ACCEPTED,
      );
    }

    this.publishWorkspaceMemberJoinedEvent(
      workspace,
      userId,
      invite.role,
      userId,
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

  private buildAcceptUrl(token: string): string {
    const frontendUrl = this.configService
      .get<string>('FRONTEND_URL')
      ?.replace(/\/$/, '');
    if (!frontendUrl) {
      throw new BadRequestException(ErrorFactory.frontendUrlNotConfigured());
    }

    return frontendUrl + '/invites/accept/' + token;
  }

  private toInviteSummary(invite: Invite): WorkspaceInviteSummaryPayload {
    return {
      id: (invite as any)._id.toString(),
      workspaceId: invite.workspaceId.toString(),
      invitedEmail: invite.invitedEmail ?? null,
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
        workspaceKey: workspace.key,
        workspaceName: workspace.name,
        inviteId: (invite as any)._id.toString(),
        role,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create workspace invite notification: ${message}`,
      );
    }
  }
}
