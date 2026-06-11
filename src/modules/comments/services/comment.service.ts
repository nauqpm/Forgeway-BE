import {
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

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
  ) {}

  async create(
    dto: CreateCommentDto,
    userId: string,
  ): Promise<CommentDocument> {
    this.logger.log(
      `Creating comment for ${dto.targetType}:${dto.targetId} by user ${userId}`,
    );

    const comment = new this.commentModel({
      content: dto.content,
      authorId: new Types.ObjectId(userId),
      targetType: dto.targetType,
      targetId: dto.targetId,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      mentions: dto.mentions?.map(id => new Types.ObjectId(id)) || [],
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
    targetType: string,
    targetId: string,
  ): Promise<CommentDocument[]> {
    this.logger.debug(`Finding comments for ${targetType}:${targetId}`);

    return this.commentModel
      .find({ targetType, targetId, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findByTargetThreaded(
    targetType: string,
    targetId: string,
  ): Promise<CommentDocument[]> {
    this.logger.debug(
      `Finding threaded comments for ${targetType}:${targetId}`,
    );

    const comments = await this.commentModel
      .find({ targetType, targetId, isDeleted: { $ne: true } })
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

  async findByParent(parentId: string): Promise<CommentDocument[]> {
    this.logger.debug(`Finding replies for parent comment: ${parentId}`);

    if (!Types.ObjectId.isValid(parentId)) {
      throw new NotFoundException(`Comment with id ${parentId} not found`);
    }

    return this.commentModel
      .find({
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

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only update your own comments');
    }

    comment.content = dto.content;
    comment.editedAt = new Date();
    return comment.save();
  }

  async delete(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting comment ${id} by user ${userId}`);

    const comment = await this.findById(id);

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.deletedBy = new Types.ObjectId(userId);
    await comment.save();
    this.logger.log(`Comment ${id} deleted`);
  }

  async countByTarget(targetType: string, targetId: string): Promise<number> {
    this.logger.debug(`Counting comments for ${targetType}:${targetId}`);

    return this.commentModel
      .countDocuments({ targetType, targetId, isDeleted: { $ne: true } })
      .exec();
  }
}
