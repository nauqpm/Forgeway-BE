import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
} from '../constants/notification.constants';
import { CreateNotificationInput } from '../interfaces/create-notification-input.interface';

interface TaskAssignedFactoryInput {
  recipientId: string;
  actorId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
}

interface TaskStatusChangedFactoryInput {
  recipientId: string;
  actorId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  fromStatus: string;
  toStatus: string;
}

interface CommentFactoryInput {
  recipientId: string;
  actorId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  commentId: string;
}

interface WorkspaceInviteFactoryInput {
  recipientId: string;
  actorId: string;
  workspaceId: string;
  workspaceKey?: string;
  workspaceName: string;
  inviteId: string;
  role: string;
}

export interface ChannelInviteFactoryInput {
  recipientId: string;
  actorId: string;
  actorName?: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  isPrivate: boolean;
}

export interface SprintLifecycleNotificationInput {
  recipientId: string;
  actorId?: string;
  workspaceId: string;
  sprintId: string;
  sprintName: string;
  endDate?: Date | null;
}

@Injectable()
export class NotificationFactoryService {
  buildTaskAssigned(input: TaskAssignedFactoryInput): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.TASK_ASSIGNED,
      title: `You were assigned to ${input.taskKey}`,
      message: input.taskTitle,
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: input.taskId,
      metadata: {
        taskId: input.taskId,
        taskKey: input.taskKey,
        taskTitle: input.taskTitle,
      },
    };
  }

  buildTaskStatusChanged(
    input: TaskStatusChangedFactoryInput,
  ): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
      title: `${input.taskKey} status changed`,
      message: `${input.fromStatus} -> ${input.toStatus}`,
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: input.taskId,
      metadata: {
        taskId: input.taskId,
        taskKey: input.taskKey,
        taskTitle: input.taskTitle,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
      },
    };
  }

  buildCommentMentioned(input: CommentFactoryInput): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.COMMENT_MENTIONED,
      title: `You were mentioned in ${input.taskKey}`,
      message: input.taskTitle,
      entityType: NOTIFICATION_ENTITY_TYPES.COMMENT,
      entityId: input.commentId,
      metadata: {
        taskId: input.taskId,
        taskKey: input.taskKey,
        taskTitle: input.taskTitle,
        commentId: input.commentId,
      },
    };
  }

  buildTaskCommentCreated(input: CommentFactoryInput): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.TASK_COMMENT_CREATED,
      title: `New comment on ${input.taskKey}`,
      message: input.taskTitle,
      entityType: NOTIFICATION_ENTITY_TYPES.COMMENT,
      entityId: input.commentId,
      metadata: {
        taskId: input.taskId,
        taskKey: input.taskKey,
        taskTitle: input.taskTitle,
        commentId: input.commentId,
      },
    };
  }

  buildWorkspaceInvited(
    input: WorkspaceInviteFactoryInput,
  ): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.WORKSPACE_INVITED,
      title: `You were invited to ${input.workspaceName}`,
      message: `Role: ${input.role}`,
      entityType: NOTIFICATION_ENTITY_TYPES.INVITE,
      entityId: input.inviteId,
      metadata: {
        workspaceId: input.workspaceId,
        workspaceKey: input.workspaceKey,
        workspaceName: input.workspaceName,
        inviteId: input.inviteId,
        role: input.role,
      },
    };
  }

  buildThreadReply(input: {
    recipientId: string;
    actorId: string;
    workspaceId: string;
    channelId: string;
    messageId: string;
    parentId: string;
    parentContent: string;
    replyContent: string;
    senderName: string;
  }): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.THREAD_REPLY,
      title: `${input.senderName} replied to a thread`,
      message: input.replyContent || 'Sent a reply',
      entityType: NOTIFICATION_ENTITY_TYPES.MESSAGE,
      entityId: input.messageId,
      metadata: {
        channelId: input.channelId,
        parentContent: input.parentContent,
        messageId: input.messageId,
        parentId: input.parentId,
      },
    };
  }

  buildChatMentioned(input: {
    recipientId: string;
    actorId: string;
    workspaceId: string;
    channelId: string;
    messageId: string;
    content: string;
    senderName: string;
  }): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.CHAT_MENTIONED,
      title: `${input.senderName} mentioned you`,
      message: input.content || 'Mentioned you in chat',
      entityType: NOTIFICATION_ENTITY_TYPES.MESSAGE,
      entityId: input.messageId,
      metadata: {
        channelId: input.channelId,
        messageId: input.messageId,
        content: input.content,
      },
    };
  }

  buildChannelInvited(
    input: ChannelInviteFactoryInput,
  ): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.CHANNEL_INVITED,
      title: input.actorName
        ? `${input.actorName} invited you to #${input.channelName}`
        : `You were invited to #${input.channelName}`,
      message: input.isPrivate
        ? `You were invited to the private channel #${input.channelName}`
        : `You were invited to #${input.channelName}`,
      entityType: NOTIFICATION_ENTITY_TYPES.CHANNEL,
      entityId: input.channelId,
      metadata: {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        channelName: input.channelName,
        isPrivate: input.isPrivate,
      },
    };
  }

  buildSprintStarted(
    input: SprintLifecycleNotificationInput,
  ): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.SPRINT_STARTED,
      title: `Sprint '${input.sprintName}' has started`,
      message: input.endDate
        ? `Sprint ends on ${new Date(input.endDate).toLocaleDateString()}`
        : 'Sprint has started',
      entityType: NOTIFICATION_ENTITY_TYPES.SPRINT,
      entityId: input.sprintId,
      metadata: {
        workspaceId: input.workspaceId,
        sprintId: input.sprintId,
        sprintName: input.sprintName,
        endDate: input.endDate,
      },
    };
  }

  buildSprintCompleted(
    input: SprintLifecycleNotificationInput,
  ): CreateNotificationInput {
    return {
      recipientId: input.recipientId,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      type: NOTIFICATION_TYPES.SPRINT_COMPLETED,
      title: `Sprint '${input.sprintName}' has been completed`,
      message: 'Sprint has been completed',
      entityType: NOTIFICATION_ENTITY_TYPES.SPRINT,
      entityId: input.sprintId,
      metadata: {
        workspaceId: input.workspaceId,
        sprintId: input.sprintId,
        sprintName: input.sprintName,
      },
    };
  }
}
