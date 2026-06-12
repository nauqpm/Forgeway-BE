import { DomainEventMetadata } from '../domain-event.interface';

export interface NotificationEventContext extends DomainEventMetadata {
  recipientId: string;
  notificationId?: string;
  workspaceId?: string;
  actorId?: string;
  version?: number;
}

export interface NotificationSummaryPayload {
  id: string;
  recipientId: string;
  actorId?: string;
  workspaceId?: string;
  type: string;
  title: string;
  message?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  readAt?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  version?: number;
}

export interface NotificationCreatedEventData extends NotificationEventContext {
  notificationId: string;
  notification: NotificationSummaryPayload;
}

export interface NotificationReadEventData extends NotificationEventContext {
  notificationId: string;
  notification: NotificationSummaryPayload;
  readAt: Date | string;
}

export interface NotificationReadAllEventData extends NotificationEventContext {
  readAt: Date | string;
  readCount?: number;
}
