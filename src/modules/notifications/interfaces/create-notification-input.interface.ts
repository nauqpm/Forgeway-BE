import {
  NotificationEntityType,
  NotificationType,
} from '../constants/notification.constants';

export interface CreateNotificationInput {
  recipientId: string;
  actorId?: string;
  workspaceId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  entityType: NotificationEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskNotificationInput {
  recipientId: string;
  actorId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
}

export interface TaskStatusChangedNotificationInput {
  recipientIds: string[];
  actorId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  fromStatus: string;
  toStatus: string;
}

export interface CommentNotificationInput {
  recipientIds: string[];
  actorId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  commentId: string;
}

export interface WorkspaceInviteNotificationInput {
  recipientId: string;
  actorId: string;
  workspaceId: string;
  workspaceKey?: string;
  workspaceName: string;
  inviteId: string;
  role: string;
}
