import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { Comment, CommentDocument } from '../schemas/comment.schema';
import { Page, PageDocument } from '../../pages/schemas/page.schema';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { resolveAndValidateMentions } from '../utils/mention-validator.util';

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Page.name)
    private readonly pageModel: Model<PageDocument>,
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

  async create(
    dto: CreateCommentDto,
    userId: string,
  ): Promise<CommentDocument> {
    this.logger.log(
      `Creating comment for ${dto.targetType}:${dto.targetId} by user ${userId}`,
    );

    await this.assertWorkspaceMember(dto.workspaceId, userId);
    await this.assertTargetInWorkspace(
      dto.workspaceId,
      dto.targetType,
      dto.targetId,
    );
    await this.assertParentInTarget(dto.workspaceId, dto);

    const resolvedMentions = await resolveAndValidateMentions(
      this.workspaceMemberService,
      dto.workspaceId,
      dto.content,
    );

    const comment = new this.commentModel({
      workspaceId: new Types.ObjectId(dto.workspaceId),
      content: dto.content,
      authorId: new Types.ObjectId(userId),
      targetType: dto.targetType,
      targetId: dto.targetId,
      inlineId: dto.inlineId,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      mentions: resolvedMentions,
    });

    const savedComment = await comment.save();
    this.logger.log(`Comment created with id: ${savedComment._id}`);
    return savedComment;
  }

  async findById(id: string): Promise<CommentDocument> {
    this.logger.debug(`Finding comment by id: ${id}`);

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }

    const comment = await this.commentModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: { $ne: true } })
      .exec();
    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }
    return comment;
  }

  async findByTarget(
    workspaceId: string,
    targetType: string,
    targetId: string,
    userId: string,
  ): Promise<CommentDocument[]> {
    this.logger.debug(
      `Finding comments for ${targetType}:${targetId} in workspace ${workspaceId}`,
    );
    await this.assertWorkspaceMember(workspaceId, userId);
    await this.assertTargetInWorkspace(workspaceId, targetType, targetId);

    return this.commentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType,
        targetId,
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findByTargetThreaded(
    workspaceId: string,
    targetType: string,
    targetId: string,
    userId: string,
  ): Promise<CommentDocument[]> {
    this.logger.debug(
      `Finding threaded comments for ${targetType}:${targetId} in workspace ${workspaceId}`,
    );
    await this.assertWorkspaceMember(workspaceId, userId);
    await this.assertTargetInWorkspace(workspaceId, targetType, targetId);

    const comments = await this.commentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType,
        targetId,
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: 1 })
      .exec();

    const commentMap = new Map<string, CommentDocument>();
    const rootComments: CommentDocument[] = [];

    comments.forEach(comment => {
      commentMap.set(comment._id.toString(), comment);
    });

    comments.forEach(comment => {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId.toString());
        if (parent) {
          if (!(parent as any).replies) {
            (parent as any).replies = [];
          }
          (parent as any).replies.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    return rootComments;
  }

  async findByParent(
    workspaceId: string,
    parentId: string,
    userId: string,
  ): Promise<CommentDocument[]> {
    this.logger.debug(`Finding replies for parent comment: ${parentId}`);
    await this.assertWorkspaceMember(workspaceId, userId);

    if (!Types.ObjectId.isValid(parentId)) {
      throw new NotFoundException(`Comment with id ${parentId} not found`);
    }

    return this.commentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        parentId: new Types.ObjectId(parentId),
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async update(
    id: string,
    dto: UpdateCommentDto,
    userId: string,
  ): Promise<CommentDocument> {
    this.logger.log(`Updating comment ${id} by user ${userId}`);

    const comment = await this.findById(id);
    await this.assertCommentWorkspaceAccess(comment, userId);

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only update your own comments');
    }

    const wsId = comment.workspaceId?.toString();
    if (!wsId) {
      throw new NotFoundException('Comment not found');
    }

    const resolvedMentions = await resolveAndValidateMentions(
      this.workspaceMemberService,
      wsId,
      dto.content,
    );

    comment.content = dto.content;
    comment.mentions = resolvedMentions;
    comment.editedAt = new Date();
    return comment.save();
  }

  async delete(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting comment ${id} by user ${userId}`);

    const comment = await this.findById(id);
    await this.assertCommentWorkspaceAccess(comment, userId);

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.deletedBy = new Types.ObjectId(userId);
    await comment.save();
    this.logger.log(`Comment ${id} deleted`);
  }

  async countByTarget(
    workspaceId: string,
    targetType: string,
    targetId: string,
    userId: string,
  ): Promise<number> {
    this.logger.debug(
      `Counting comments for ${targetType}:${targetId} in workspace ${workspaceId}`,
    );
    await this.assertWorkspaceMember(workspaceId, userId);
    await this.assertTargetInWorkspace(workspaceId, targetType, targetId);

    return this.commentModel
      .countDocuments({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType,
        targetId,
        isDeleted: { $ne: true },
      })
      .exec();
  }

  async resolve(id: string, userId: string): Promise<CommentDocument> {
    this.logger.log(`Resolving comment ${id} by user ${userId}`);

    const comment = await this.findById(id);
    await this.assertCommentWorkspaceAccess(comment, userId);
    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only resolve your own comments');
    }
    comment.isResolved = true;
    comment.resolvedBy = new Types.ObjectId(userId);
    comment.resolvedAt = new Date();
    return comment.save();
  }

  async unresolve(id: string, userId: string): Promise<CommentDocument> {
    this.logger.log(`Unresolving comment ${id} by user ${userId}`);

    const comment = await this.findById(id);
    await this.assertCommentWorkspaceAccess(comment, userId);
    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only unresolve your own comments');
    }
    comment.isResolved = false;
    comment.resolvedBy = undefined;
    comment.resolvedAt = undefined;
    return comment.save();
  }

  async findByInlineId(
    workspaceId: string,
    targetType: string,
    targetId: string,
    inlineId: string,
    userId: string,
  ): Promise<CommentDocument[]> {
    this.logger.debug(
      `Finding comments for inline ${inlineId} in ${targetType}:${targetId} workspace ${workspaceId}`,
    );
    await this.assertWorkspaceMember(workspaceId, userId);
    await this.assertTargetInWorkspace(workspaceId, targetType, targetId);

    return this.commentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType,
        targetId,
        inlineId,
        isDeleted: { $ne: true },
        parentId: { $exists: false },
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  private async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    this.validateObjectId(workspaceId, 'Workspace');
    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private async assertTargetInWorkspace(
    workspaceId: string,
    targetType: string,
    targetId: string,
  ): Promise<void> {
    if (!['task', 'page'].includes(targetType)) {
      throw new BadRequestException('targetType must be "task" or "page"');
    }
    this.validateObjectId(workspaceId, 'Workspace');
    this.validateObjectId(targetId, 'Target');

    const query = {
      _id: new Types.ObjectId(targetId),
      workspaceId: new Types.ObjectId(workspaceId),
    };

    const exists =
      targetType === 'task'
        ? await this.taskModel.exists({
            ...query,
            isDeleted: { $ne: true },
          })
        : await this.pageModel.exists(query);

    if (!exists) {
      throw new NotFoundException(`${targetType} target not found`);
    }
  }

  private async assertParentInTarget(
    workspaceId: string,
    dto: CreateCommentDto,
  ): Promise<void> {
    if (!dto.parentId) return;
    this.validateObjectId(dto.parentId, 'Parent comment');

    const parent = await this.commentModel
      .findOne({
        _id: new Types.ObjectId(dto.parentId),
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: dto.targetType,
        targetId: dto.targetId,
        isDeleted: { $ne: true },
      })
      .exec();

    if (!parent) {
      throw new NotFoundException('Parent comment not found');
    }
  }

  private async assertCommentWorkspaceAccess(
    comment: CommentDocument,
    userId: string,
  ): Promise<void> {
    if (!comment.workspaceId) {
      throw new NotFoundException('Comment not found');
    }
    await this.assertWorkspaceMember(comment.workspaceId.toString(), userId);
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new NotFoundException(`${label} not found`);
    }
  }
}
