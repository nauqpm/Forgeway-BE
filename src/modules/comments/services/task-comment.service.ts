import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { CommentDto } from '../dtos/comment.dto';
import { CreateTaskCommentDto } from '../dtos/create-task-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentMapper } from '../mappers/comment.mapper';
import { Comment, CommentDocument } from '../schemas/comment.schema';

@Injectable()
export class TaskCommentService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly commentMapper: CommentMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
  ) {}

  async createForTask(
    workspaceId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
    userId: string,
  ): Promise<CommentDto> {
    const task = await this.getCommentableTask(workspaceId, taskId, userId);
    await this.validateParentComment(workspaceId, taskId, dto.parentId);

    const comment = await new this.commentModel({
      workspaceId: new Types.ObjectId(workspaceId),
      content: dto.content,
      authorId: new Types.ObjectId(userId),
      targetType: 'task',
      targetId: taskId,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      mentions: dto.mentions?.map((id) => new Types.ObjectId(id)) || [],
    }).save();

    await this.taskActivitiesService.recordCommentAdded(
      task,
      userId,
      comment._id.toString(),
    );

    const populated = await this.findTaskCommentDocument(
      workspaceId,
      taskId,
      comment._id.toString(),
    );

    if (!populated) {
      throw new NotFoundException('Comment not found');
    }

    return this.commentMapper.mapToDto(populated);
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
    await this.getCommentableTask(workspaceId, taskId, userId);
    const comment = await this.findTaskCommentDocument(workspaceId, taskId, commentId);

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

    return this.commentMapper.mapToDto(saved);
  }

  async deleteForTask(
    workspaceId: string,
    taskId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    await this.getCommentableTask(workspaceId, taskId, userId);
    const comment = await this.findTaskCommentDocument(workspaceId, taskId, commentId);

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

    const parent = await this.findTaskCommentDocument(workspaceId, taskId, parentId);
    if (!parent) {
      throw new NotFoundException(`Parent comment with id ${parentId} not found`);
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
    const isMember = await this.workspacesService.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${label} must be a valid MongoDB ObjectId`);
    }
  }
}