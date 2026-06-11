import {
  NotificationEntityType,
  NotificationType,
} from '../constants/notification.constants';

export interface NotificationActorDto {
  id: string;
  email?: string;
  fullName?: string;
  avatar?: string;
}

export interface NotificationDto {
  id: string;
  recipientId: string;
  actorId?: string;
  actor?: NotificationActorDto;
  workspaceId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  entityType: NotificationEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationListDto {
  notifications: NotificationDto[];
  total: number;
  page: number;
  limit: number;
}
