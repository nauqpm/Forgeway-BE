import { Injectable } from '@nestjs/common';
import { AttachmentDto, AttachmentUserDto } from '../dtos/attachment.dto';
import { AttachmentDocument } from '../schemas/attachment.schema';

@Injectable()
export class AttachmentMapper {
  mapToDto(attachment: AttachmentDocument): AttachmentDto {
    const value =
      typeof attachment.toObject === 'function'
        ? attachment.toObject()
        : attachment;
    const plain = value as Record<string, any>;

    return {
      id: this.toId(plain._id),
      workspaceId: this.toOptionalId(plain.workspaceId),
      originalName: plain.originalName,
      filename: plain.filename,
      mimeType: plain.mimeType,
      size: plain.size,
      targetType: plain.targetType,
      targetId: String(plain.targetId),
      uploadedBy: this.toId(plain.uploadedBy),
      uploader: this.mapUser(plain.uploadedBy),
      downloadCount: Number(plain.downloadCount || 0),
      isDeleted: Boolean(plain.isDeleted),
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  }

  mapToDtos(attachments: AttachmentDocument[]): AttachmentDto[] {
    return attachments.map(attachment => this.mapToDto(attachment));
  }

  private mapUser(value: unknown): AttachmentUserDto | undefined {
    if (!value || typeof value !== 'object' || !('_id' in value)) {
      return undefined;
    }

    const user = value as Record<string, unknown>;
    return {
      id: this.toId(user._id),
      fullName: this.toOptionalString(user.fullName),
      email: this.toOptionalString(user.email),
      avatar: this.toOptionalString(user.avatar),
    };
  }

  private toId(value: unknown): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'object' && '_id' in value) {
      return String(value._id);
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
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
