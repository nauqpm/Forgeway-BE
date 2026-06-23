import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { CommentDocument } from '../schemas/comment.schema';
import { TaskDocument } from '../../tasks/schemas/task.schema';

@Injectable()
export class TaskCommentNotificationService {
  private readonly logger = new Logger(TaskCommentNotificationService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

  async notifyTaskComment(
    comment: CommentDocument,
    task: TaskDocument,
    actorId: string,
  ): Promise<void> {
    const commentId = comment._id.toString();
    const taskId = task._id.toString();

    try {
      const workspaceId = this.toId(task.workspaceId);
      if (!workspaceId) {
        this.logger.warn(
          `Cannot notify task comment for comment ${commentId} on task ${taskId}: missing workspaceId`,
        );
        return;
      }

      const mentionRecipientIds = this.uniqueIds(comment.mentions)
        .filter(recipientId => recipientId !== actorId)
        .filter(recipientId => recipientId.length > 0);

      // Only send mention notifications to workspace members
      const memberMentionIds = await this.filterWorkspaceMembers(
        workspaceId,
        mentionRecipientIds,
      );

      if (memberMentionIds.length > 0) {
        await this.notificationsService.notifyCommentMentioned({
          recipientIds: memberMentionIds,
          actorId,
          workspaceId,
          taskId,
          taskKey: task.key,
          taskTitle: task.title,
          commentId,
        });
      }

      const mentioned = new Set(memberMentionIds);
      const relatedRecipientIds = this.uniqueIds([
        task.assigneeId,
        task.reporterId,
      ]).filter(
        recipientId => recipientId !== actorId && !mentioned.has(recipientId),
      );

      // Only send comment notifications to workspace members
      const memberRelatedIds = await this.filterWorkspaceMembers(
        workspaceId,
        relatedRecipientIds,
      );

      if (memberRelatedIds.length > 0) {
        await this.notificationsService.notifyTaskCommentCreated({
          recipientIds: memberRelatedIds,
          actorId,
          workspaceId,
          taskId,
          taskKey: task.key,
          taskTitle: task.title,
          commentId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create task comment notification for comment ${commentId} on task ${taskId} (actor: ${actorId}): ${message}`,
      );
    }
  }

  async notifyAddedMentions(
    comment: CommentDocument,
    task: TaskDocument,
    actorId: string,
    addedMentionIds: string[],
  ): Promise<void> {
    const commentId = comment._id.toString();
    const taskId = task._id.toString();

    if (addedMentionIds.length === 0) {
      return;
    }

    try {
      const workspaceId = this.toId(task.workspaceId);
      if (!workspaceId) {
        this.logger.warn(
          `Cannot notify added mentions for comment ${commentId} on task ${taskId}: missing workspaceId`,
        );
        return;
      }

      const recipientIds = addedMentionIds.filter(id => id !== actorId);
      const memberRecipientIds = await this.filterWorkspaceMembers(
        workspaceId,
        recipientIds,
      );

      if (memberRecipientIds.length === 0) {
        return;
      }

      await this.notificationsService.notifyCommentMentioned({
        recipientIds: memberRecipientIds,
        actorId,
        workspaceId,
        taskId,
        taskKey: task.key,
        taskTitle: task.title,
        commentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to notify newly mentioned users for comment ${commentId} on task ${taskId} (actor: ${actorId}): ${message}`,
      );
    }
  }

  private async filterWorkspaceMembers(
    workspaceId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    return this.workspaceMemberService.filterMembers(workspaceId, userIds);
  }

  private uniqueIds(values: Array<unknown>): string[] {
    return Array.from(
      new Set(
        values
          .map(value => this.toId(value))
          .filter(
            (value): value is string =>
              value !== undefined && Types.ObjectId.isValid(value),
          ),
      ),
    );
  }

  private toId(value: unknown): string | undefined {
    if (!value) return undefined;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    // For populated documents, extract the nested _id
    const target = (value as { _id?: unknown })._id ?? value;

    if (typeof (target as any)?.toString !== 'function') return undefined;

    const result = (target as any).toString();
    return result && result !== '[object Object]' ? result : undefined;
  }
}
