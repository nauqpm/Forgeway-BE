import { Injectable } from '@nestjs/common';
import { CommentDocument } from '../schemas/comment.schema';
import { CommentAuthorDto, CommentDto } from '../dtos/comment.dto';

@Injectable()
export class CommentMapper {
  mapToDto(comment: CommentDocument): CommentDto {
    const value =
      typeof comment.toObject === 'function' ? comment.toObject() : comment;
    const plain = value as Record<string, any>;

    return {
      id: this.toId(plain._id),
      workspaceId: this.toOptionalId(plain.workspaceId),
      content: plain.content,
      authorId: this.toId(plain.authorId),
      author: this.mapAuthor(plain.authorId),
      targetType: plain.targetType,
      targetId: String(plain.targetId),
      parentId: this.toOptionalId(plain.parentId),
      inlineId: plain.inlineId || undefined,
      mentions: Array.isArray(plain.mentions)
        ? plain.mentions.map(item => this.toId(item)).filter(Boolean)
        : [],
      isDeleted: Boolean(plain.isDeleted),
      isResolved: Boolean(plain.isResolved),
      resolvedBy: this.toOptionalId(plain.resolvedBy),
      resolvedAt: plain.resolvedAt,
      editedAt: plain.editedAt,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
      replies: Array.isArray((plain as any).replies)
        ? (plain as any).replies.map((r: any) => this.mapToDto(r))
        : undefined,
    };
  }

  mapToDtos(comments: CommentDocument[]): CommentDto[] {
    return comments.map(comment => this.mapToDto(comment));
  }

  private mapAuthor(value: unknown): CommentAuthorDto | undefined {
    if (!value || typeof value !== 'object' || !('_id' in value)) {
      return undefined;
    }

    const author = value as Record<string, unknown>;
    return {
      id: this.toId(author._id),
      fullName: this.toOptionalString(author.fullName),
      email: this.toOptionalString(author.email),
      avatar: this.toOptionalString(author.avatar),
    };
  }

  private toId(value: unknown): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'object' && '_id' in value) {
      return String(value._id);
    }
    return String(value);
  }

  private toOptionalId(value: unknown): string | undefined {
    const id = this.toId(value);
    return id || undefined;
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
