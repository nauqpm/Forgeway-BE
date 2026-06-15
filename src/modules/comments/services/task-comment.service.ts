import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import {
  TaskCommentCreatedEvent,
  TaskCommentDeletedEvent,
  TaskCommentUpdatedEvent,
} from '../../../shared/events/domain-events/task';
import { CommentDto } from '../dtos/comment.dto';
import { CreateTaskCommentDto } from '../dtos/create-task-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentMapper } from '../mappers/comment.mapper';
import { Comment, CommentDocument } from '../schemas/comment.schema';

@Injectable()
export class TaskCommentService {
  private readonly logger = new Logger(TaskCommentService.name);

  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly commentMapper: CommentMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createForTask(
    workspaceId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
    userId: string,
  ): Promise<CommentDto> {
    const task = await this.getCommentableTask(workspaceId, taskId, userId);
    await this.validateParentComment(workspaceId, taskId, dto.parentId);

    if (dto.mentions && dto.mentions.length > 0) {
      await this.validateMentionsAreMembers(workspaceId, dto.mentions);
    }

    const comment = await new this.commentModel({
      workspaceId: new Types.ObjectId(workspaceId),
      content: dto.content,
      authorId: new Types.ObjectId(userId),
      targetType: 'task',
      targetId: taskId,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      mentions: dto.mentions?.map(id => new Types.ObjectId(id)) || [],
    }).save();

    await this.taskActivitiesService.recordCommentAdded(
      task,
      userId,
      comment._id.toString(),
    );
    await this.notifyTaskComment(comment, task, userId);

    const populated = await this.findTaskCommentDocument(
      workspaceId,
      taskId,
      comment._id.toString(),
    );

    if (!populated) {
      throw new NotFoundException('Comment not found');
    }

    const commentDto = this.commentMapper.mapToDto(populated);
    this.publishCommentCreatedEvent(task, userId, commentDto);

    return commentDto;
  }

  async findByTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<CommentDto[]> {
    await this.getReadableTask(workspaceId, taskId, userId);

    const comments = await this.commentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: 'task',
        targetId: taskId,
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: 1 })
      .populate('authorId', 'fullName email avatar')
      .exec();

    return this.commentMapper.mapToDtos(comments);
  }

  async updateForTask(
    workspaceId: string,
    taskId: string,
    commentId: string,
    dto: UpdateCommentDto,
    userId: string,
  ): Promise<CommentDto> {
    const task = await this.getCommentableTask(workspaceId, taskId, userId);
    const comment = await this.findTaskCommentDocument(
      workspaceId,
      taskId,
      commentId,
    );

    if (!comment) {
      throw new NotFoundException(`Comment with id ${commentId} not found`);
    }
    const authorIdString = (comment.authorId as any)._id
      ? (comment.authorId as any)._id.toString()
      : comment.authorId.toString();

    if (authorIdString !== userId) {
      throw new ForbiddenException('You can only update your own comments');
    }

    comment.content = dto.content;
    comment.editedAt = new Date();
    const saved = await comment.save();
    await saved.populate('authorId', 'fullName email avatar');
    await this.taskActivitiesService.recordCommentUpdated(
      task,
      userId,
      comment._id.toString(),
    );

    const commentDto = this.commentMapper.mapToDto(saved);
    this.publishCommentUpdatedEvent(task, userId, commentDto);

    return commentDto;
  }

  async deleteForTask(
    workspaceId: string,
    taskId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    const task = await this.getCommentableTask(workspaceId, taskId, userId);
    const comment = await this.findTaskCommentDocument(
      workspaceId,
      taskId,
      commentId,
    );

    if (!comment) {
      throw new NotFoundException(`Comment with id ${commentId} not found`);
    }
    const authorIdString = (comment.authorId as any)._id
      ? (comment.authorId as any)._id.toString()
      : comment.authorId.toString();

    if (authorIdString !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.deletedBy = new Types.ObjectId(userId);
    await comment.save();
    await this.taskActivitiesService.recordCommentDeleted(
      task,
      userId,
      comment._id.toString(),
    );
    this.publishCommentDeletedEvent(task, userId, comment._id.toString());
  }

  private publishCommentCreatedEvent(
    task: TaskDocument,
    actorId: string,
    comment: CommentDto,
  ): void {
    const event = new TaskCommentCreatedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: task._id.toString(),
      taskKey: task.key,
      actorId,
      version: task.version,
      commentId: comment.id,
      comment,
    });

    this.eventEmitter.emit(event.type, event);
  }

  private publishCommentUpdatedEvent(
    task: TaskDocument,
    actorId: string,
    comment: CommentDto,
  ): void {
    const event = new TaskCommentUpdatedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: task._id.toString(),
      taskKey: task.key,
      actorId,
      version: task.version,
      commentId: comment.id,
      comment,
    });

    this.eventEmitter.emit(event.type, event);
  }

  private publishCommentDeletedEvent(
    task: TaskDocument,
    actorId: string,
    commentId: string,
  ): void {
    const event = new TaskCommentDeletedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: task._id.toString(),
      taskKey: task.key,
      actorId,
      version: task.version,
      commentId,
    });

    this.eventEmitter.emit(event.type, event);
  }
  private async getReadableTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDocument> {
    this.validateObjectId(workspaceId, 'Workspace');
    this.validateObjectId(taskId, 'Task');
    await this.workspacesService.findById(workspaceId);
    await this.assertWorkspaceMember(workspaceId, userId);

    const task = await this.taskModel
      .findOne({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return task;
  }

  private async getCommentableTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDocument> {
    const task = await this.getReadableTask(workspaceId, taskId, userId);

    if (task.isArchived) {
      throw new BadRequestException('Archived task comments are read-only');
    }

    return task;
  }

  private async validateParentComment(
    workspaceId: string,
    taskId: string,
    parentId?: string,
  ): Promise<void> {
    if (!parentId) {
      return;
    }
    this.validateObjectId(parentId, 'Parent comment');

    const parent = await this.findTaskCommentDocument(
      workspaceId,
      taskId,
      parentId,
    );
    if (!parent) {
      throw new NotFoundException(
        `Parent comment with id ${parentId} not found`,
      );
    }
  }

  private async findTaskCommentDocument(
    workspaceId: string,
    taskId: string,
    commentId: string,
  ): Promise<CommentDocument | null> {
    if (!Types.ObjectId.isValid(commentId)) {
      return null;
    }

    return this.commentModel
      .findOne({
        _id: new Types.ObjectId(commentId),
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: 'task',
        targetId: taskId,
        isDeleted: { $ne: true },
      })
      .populate('authorId', 'fullName email avatar')
      .exec();
  }

  private async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `${label} must be a valid MongoDB ObjectId`,
      );
    }
  }
  private async validateMentionsAreMembers(
    workspaceId: string,
    mentionedUserIds: string[],
  ): Promise<void> {
    // Single query — fetches workspace once and checks membership in memory
    const nonMembers = await this.workspaceMemberService.filterNonMembers(
      workspaceId,
      mentionedUserIds,
    );

    if (nonMembers.length > 0) {
      throw new BadRequestException(
        'Mentioned users must be members of this workspace',
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

    // Single query — fetches workspace once and filters in memory
    return this.workspaceMemberService.filterMembers(workspaceId, userIds);
  }

  private async notifyTaskComment(
    comment: CommentDocument,
    task: TaskDocument,
    actorId: string,
  ): Promise<void> {
    try {
      const workspaceId = this.toId(task.workspaceId);
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
          taskId: task._id.toString(),
          taskKey: task.key,
          taskTitle: task.title,
          commentId: comment._id.toString(),
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
          taskId: task._id.toString(),
          taskKey: task.key,
          taskTitle: task.title,
          commentId: comment._id.toString(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create task comment notification: ${message}`,
      );
    }
  }

  private uniqueIds(values: Array<unknown>): string[] {
    return Array.from(
      new Set(
        values
          .map(value => this.toId(value))
          .filter(value => Types.ObjectId.isValid(value)),
      ),
    );
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }
}
