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
  workspaceName: string;
  inviteId: string;
  role: string;
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
        workspaceName: input.workspaceName,
        inviteId: input.inviteId,
        role: input.role,
      },
    };
  }
}