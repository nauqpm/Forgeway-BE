import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  NotificationDto,
  NotificationListDto,
} from '../dtos/notification.dto';
import {
  CommentNotificationInput,
  CreateNotificationInput,
  TaskNotificationInput,
  WorkspaceInviteNotificationInput,
} from '../interfaces/create-notification-input.interface';
import { NotificationMapper } from '../mappers/notification.mapper';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { NotificationFactoryService } from './notification-factory.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly notificationMapper: NotificationMapper,
    private readonly notificationFactory: NotificationFactoryService,
  ) {}

  async create(input: CreateNotificationInput): Promise<NotificationDto | null> {
    if (!this.isValidRecipient(input.recipientId)) {
      this.logger.warn(`Skip notification with invalid recipient ${input.recipientId}`);
      return null;
    }

    const notification = await this.notificationsRepository.create(input);
    return this.notificationMapper.mapToDto(notification);
  }

  async createMany(
    inputs: CreateNotificationInput[],
  ): Promise<NotificationDto[]> {
    const validInputs = inputs.filter((input) =>
      this.isValidRecipient(input.recipientId),
    );
    if (!validInputs.length) {
      return [];
    }

    const notifications =
      await this.notificationsRepository.createMany(validInputs);
    return notifications.map((notification) =>
      this.notificationMapper.mapToDto(notification),
    );
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

  async notifyCommentMentioned(input: CommentNotificationInput): Promise<void> {
    const recipientIds = this.getRecipients(input.recipientIds, input.actorId);
    await this.createMany(
      recipientIds.map((recipientId) =>
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
      recipientIds.map((recipientId) =>
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

  async listForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<NotificationListDto> {
    const result = await this.notificationsRepository.findByRecipient(
      userId,
      page,
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

    return this.notificationMapper.mapToDto(notification);
  }

  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    return this.notificationsRepository.markAllAsReadForRecipient(userId);
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
          .filter((recipientId) => Types.ObjectId.isValid(recipientId))
          .map((recipientId) => recipientId.toString())
          .filter((recipientId) => recipientId !== actor),
      ),
    );
  }

  private isValidRecipient(recipientId: string): boolean {
    return Types.ObjectId.isValid(recipientId);
  }
}