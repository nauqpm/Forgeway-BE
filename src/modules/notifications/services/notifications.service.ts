import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationDto, NotificationListDto } from '../dtos/notification.dto';
import {
  CommentNotificationInput,
  CreateNotificationInput,
  TaskNotificationInput,
  TaskStatusChangedNotificationInput,
  WorkspaceInviteNotificationInput,
} from '../interfaces/create-notification-input.interface';
import { NotificationMapper } from '../mappers/notification.mapper';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { NotificationDomainEventPublisher } from './notification-domain-event.publisher';
import {
  NotificationFactoryService,
  SprintLifecycleNotificationInput,
} from './notification-factory.service';
import { PushNotificationService } from './push-notification.service';
import { InviteStatusValue } from '../../workspaces/schemas/invite.schema';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly notificationMapper: NotificationMapper,
    private readonly notificationFactory: NotificationFactoryService,
    private readonly notificationDomainEventPublisher: NotificationDomainEventPublisher,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationDto | null> {
    if (!this.isValidRecipient(input.recipientId)) {
      this.logger.warn(
        `Skip notification with invalid recipient ${input.recipientId}`,
      );
      return null;
    }

    const notification = await this.notificationsRepository.create(input);
    const notificationDto = this.notificationMapper.mapToDto(notification);
    this.notificationDomainEventPublisher.publishCreated(notificationDto);

    // Trigger push notification asynchronously
    this.pushNotificationService
      .sendPushNotification(
        [notificationDto.recipientId],
        notificationDto.title,
        notificationDto.message || '',
        {
          entityId: notificationDto.entityId,
          type: notificationDto.type,
          workspaceId: notificationDto.workspaceId,
        },
      )
      .catch(e => this.logger.error('Push notification failed', e));

    return notificationDto;
  }

  async createMany(
    inputs: CreateNotificationInput[],
  ): Promise<NotificationDto[]> {
    const validInputs = inputs.filter(input =>
      this.isValidRecipient(input.recipientId),
    );
    if (!validInputs.length) {
      return [];
    }

    const notifications =
      await this.notificationsRepository.createMany(validInputs);
    const notificationDtos = notifications.map(notification =>
      this.notificationMapper.mapToDto(notification),
    );
    this.notificationDomainEventPublisher.publishManyCreated(notificationDtos);

    // Group or send push notifications individually asynchronously
    for (const dto of notificationDtos) {
      this.pushNotificationService
        .sendPushNotification([dto.recipientId], dto.title, dto.message || '', {
          entityId: dto.entityId,
          type: dto.type,
          workspaceId: dto.workspaceId,
        })
        .catch(e => this.logger.error('Push notification failed', e));
    }

    return notificationDtos;
  }

  async notifyTaskAssigned(input: TaskNotificationInput): Promise<void> {
    const recipientIds = this.getRecipients([input.recipientId], input.actorId);
    if (!recipientIds.length) {
      return;
    }

    await this.create(
      this.notificationFactory.buildTaskAssigned({
        ...input,
        recipientId: recipientIds[0],
      }),
    );
  }

  async notifyTaskStatusChanged(
    input: TaskStatusChangedNotificationInput,
  ): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildTaskStatusChanged({
          ...input,
          recipientId,
        }),
      ),
    );
  }

  async notifyCommentMentioned(input: CommentNotificationInput): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildCommentMentioned({
          ...input,
          recipientId,
        }),
      ),
    );
  }

  async notifyTaskCommentCreated(
    input: CommentNotificationInput,
  ): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildTaskCommentCreated({
          ...input,
          recipientId,
        }),
      ),
    );
  }

  async notifyWorkspaceInvited(
    input: WorkspaceInviteNotificationInput,
  ): Promise<void> {
    const recipientIds = this.getRecipients([input.recipientId], input.actorId);
    if (!recipientIds.length) {
      return;
    }

    await this.create(
      this.notificationFactory.buildWorkspaceInvited({
        ...input,
        recipientId: recipientIds[0],
      }),
    );
  }

  async notifyThreadReply(input: {
    recipientIds: string[];
    actorId: string;
    workspaceId?: string;
    channelId: string;
    messageId: string;
    parentId: string;
    parentContent: string;
    replyContent: string;
    senderName: string;
  }): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildThreadReply({
          ...input,
          workspaceId: input.workspaceId || '',
          recipientId,
        }),
      ),
    );
  }

  async notifyChatMentioned(input: {
    recipientIds: string[];
    actorId: string;
    workspaceId?: string;
    channelId: string;
    messageId: string;
    content: string;
    senderName: string;
  }): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildChatMentioned({
          ...input,
          workspaceId: input.workspaceId || '',
          recipientId,
        }),
      ),
    );
  }

  async notifySprintStarted(
    input: Omit<SprintLifecycleNotificationInput, 'recipientId'> & {
      recipientIds: string[];
    },
  ): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildSprintStarted({
          ...input,
          recipientId,
        }),
      ),
    );
  }

  async notifySprintCompleted(
    input: Omit<SprintLifecycleNotificationInput, 'recipientId'> & {
      recipientIds: string[];
    },
  ): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map(recipientId =>
        this.notificationFactory.buildSprintCompleted({
          ...input,
          recipientId,
        }),
      ),
    );
  }

  async listForUser(
    userId: string,
    cursor?: string,
    unreadOnly?: boolean,
    category?: string,
    limit = 20,
  ): Promise<NotificationListDto> {
    const result = await this.notificationsRepository.findByRecipientCursor(
      userId,
      cursor,
      unreadOnly,
      category,
      limit,
    );

    return this.notificationMapper.mapToListDto(result);
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationsRepository.countUnread(userId);
    return { count };
  }

  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDto> {
    const notification =
      await this.notificationsRepository.markAsReadForRecipient(
        notificationId,
        userId,
      );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const notificationDto = this.notificationMapper.mapToDto(notification);
    this.notificationDomainEventPublisher.publishRead(notificationDto);

    return notificationDto;
  }

  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const readAt = new Date();
    const result = await this.notificationsRepository.markAllAsReadForRecipient(
      userId,
      readAt,
    );
    this.notificationDomainEventPublisher.publishReadAll(
      userId,
      readAt,
      result.modifiedCount,
    );

    return result;
  }

  /**
   * Updates the `metadata.status` field of the WORKSPACE_INVITED notification
   * associated with the given invite and recipient.
   *
   * This is a best-effort side-effect — callers should wrap in try/catch since
   * failure here should not block the main invite accept/decline flow.
   */
  async updateInviteNotificationStatus(
    inviteId: string,
    userId: string | undefined,
    status: InviteStatusValue,
  ): Promise<void> {
    const result = await this.notificationsRepository.updateInviteStatus(
      inviteId,
      userId,
      status,
    );
    if (result.modifiedCount === 0) {
      this.logger.warn(
        `No notification found to update for inviteId=${inviteId}, userId=${userId}, status=${status}`,
      );
    }
  }

  async findByIdForUser(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDto> {
    const notification =
      await this.notificationsRepository.findByIdForRecipient(
        notificationId,
        userId,
      );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.notificationMapper.mapToDto(notification);
  }

  private getRecipients(recipients: string[], actorId?: string): string[] {
    const actor = actorId?.toString();
    return Array.from(
      new Set(
        recipients
          .filter(recipientId => Types.ObjectId.isValid(recipientId))
          .map(recipientId => recipientId.toString())
          .filter(recipientId => recipientId !== actor),
      ),
    );
  }

  private isValidRecipient(recipientId: string): boolean {
    return Types.ObjectId.isValid(recipientId);
  }
}
