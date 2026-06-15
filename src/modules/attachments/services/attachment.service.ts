import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AttachmentFile,
  CreateAttachmentInput,
} from '../dtos/attachment-input.dto';
import { Attachment, AttachmentDocument } from '../schemas/attachment.schema';

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    @InjectModel(Attachment.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
  ) {}

  async create(input: CreateAttachmentInput, file: AttachmentFile, userId: string): Promise<AttachmentDocument> {
    this.logger.log(`Creating attachment for ${input.targetType}:${input.targetId}`);

    const relativePath = file.destination ? file.destination.replace(/\\/g, '/') : 'uploads/others';
    const storageDir = relativePath.startsWith('uploads/') ? relativePath.slice('uploads/'.length) : relativePath;
    const storageKey = `${storageDir}/${file.filename}`.replace(/\/+/g, '/');
    const url = `/uploads/${storageKey}`.replace(/\/+/g, '/');

    const attachment = new this.attachmentModel({
      workspaceId: input.workspaceId
        ? new Types.ObjectId(input.workspaceId)
        : undefined,
      uploadedBy: new Types.ObjectId(userId),
      filename: file.filename,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      storageKey,
      url: url,
      targetType: input.targetType,
      targetId: input.targetId,
      downloadCount: 0,
      isDeleted: false,
    });

    return attachment.save();
  }

  async findById(id: string): Promise<AttachmentDocument> {
    this.logger.log(`Finding attachment by id: ${id}`);

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    const attachment = await this.attachmentModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: { $ne: true } })
      .exec();

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    return attachment;
  }

  async findByTarget(
    targetType: string,
    targetId: string,
  ): Promise<AttachmentDocument[]> {
    this.logger.log(`Finding attachments for ${targetType}:${targetId}`);

    return this.attachmentModel
      .find({ targetType, targetId, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .exec();
  }

  async softDelete(id: string, userId: string): Promise<void> {
    this.logger.log(`Soft deleting attachment: ${id}`);

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    const result = await this.attachmentModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: new Types.ObjectId(userId),
          },
        },
        { new: true },
      )
      .exec();

    if (!result) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
  }

  async incrementDownloadCount(id: string): Promise<AttachmentDocument> {
    this.logger.log(`Incrementing download count for attachment: ${id}`);

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    const attachment = await this.attachmentModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: { $ne: true } },
        { $inc: { downloadCount: 1 } },
        { new: true },
      )
      .exec();

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    return attachment;
  }
}
