import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  NotificationCreatedEvent,
  NotificationReadAllEvent,
  NotificationReadEvent,
  NotificationSummaryPayload,
} from '../../../shared/events/domain-events/notification';
import { NotificationDto } from '../dtos/notification.dto';

@Injectable()
export class NotificationDomainEventPublisher {
  private readonly logger = new Logger(NotificationDomainEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  publishCreated(notification: NotificationDto): void {
    this.emit(
      new NotificationCreatedEvent({
        recipientId: notification.recipientId,
        notificationId: notification.id,
        workspaceId: notification.workspaceId,
        actorId: notification.actorId,
        notification: this.toNotificationSummary(notification),
      }),
    );
  }

  publishManyCreated(notifications: NotificationDto[]): void {
    notifications.forEach(notification => this.publishCreated(notification));
  }

  publishRead(notification: NotificationDto): void {
    this.emit(
      new NotificationReadEvent({
        recipientId: notification.recipientId,
        notificationId: notification.id,
        workspaceId: notification.workspaceId,
        actorId: notification.actorId,
        notification: this.toNotificationSummary(notification),
        readAt: notification.readAt ?? new Date(),
      }),
    );
  }

  publishReadAll(recipientId: string, readAt: Date, readCount?: number): void {
    this.emit(
      new NotificationReadAllEvent({
        recipientId,
        readAt,
        readCount,
      }),
    );
  }

  private emit(event: { type: string }): void {
    try {
      this.eventEmitter.emit(event.type, event);
    } catch (error) {
      this.logger.warn(
        `Failed to publish notification domain event. type=${event.type}, reason=${(error as Error).message}`,
      );
    }
  }

  private toNotificationSummary(
    notification: NotificationDto,
  ): NotificationSummaryPayload {
    return {
      id: notification.id,
      recipientId: notification.recipientId,
      actorId: notification.actorId,
      workspaceId: notification.workspaceId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      metadata: notification.metadata,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
