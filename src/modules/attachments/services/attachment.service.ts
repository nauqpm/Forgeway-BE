import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { extname } from 'path';
import { CreateAttachmentInput } from '../dtos/attachment-input.dto';
import { Attachment, AttachmentDocument } from '../schemas/attachment.schema';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Page, PageDocument } from '../../pages/schemas/page.schema';
import { Channel, ChannelDocument } from '../../chat/schemas/channel.schema';
import {
  slugify,
  slugifyFilename,
  generateShortHash,
  getDatePath,
  decodeFilename,
} from '../../cloudinary/cloudinary.utils';

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    @InjectModel(Attachment.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Page.name) private readonly pageModel: Model<PageDocument>,
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async create(
    input: CreateAttachmentInput,
    file: Express.Multer.File,
    userId: string,
  ): Promise<AttachmentDocument> {
    if (file) {
      file.originalname = decodeFilename(file.originalname);
    }
    if (input) {
      input.originalName = decodeFilename(
        input.originalName || file?.originalname || '',
      );
    }

    this.logger.log(
      `Creating attachment for ${input.targetType}:${input.targetId}`,
    );

    let folder = `general/${getDatePath()}`;

    let targetFolder = input.targetId;
    if (
      input.targetType &&
      input.targetId &&
      Types.ObjectId.isValid(input.targetId)
    ) {
      try {
        const lowerType = input.targetType.toLowerCase();
        if (lowerType === 'task' || lowerType === 'tasks') {
          const task = await this.taskModel
            .findById(new Types.ObjectId(input.targetId))
            .exec();
          if (task) {
            targetFolder = `${slugify(task.title)}_${input.targetId}`;
            if (!input.workspaceId && task.workspaceId) {
              input.workspaceId = task.workspaceId.toString();
            }
          }
        } else if (lowerType === 'page' || lowerType === 'pages') {
          const page = await this.pageModel
            .findById(new Types.ObjectId(input.targetId))
            .exec();
          if (page) {
            targetFolder = `${slugify(page.title)}_${input.targetId}`;
            if (!input.workspaceId && page.workspaceId) {
              input.workspaceId = page.workspaceId.toString();
            }
          }
        } else if (lowerType === 'channel' || lowerType === 'channels') {
          const channel = await this.channelModel
            .findById(new Types.ObjectId(input.targetId))
            .exec();
          if (channel) {
            targetFolder = `${slugify(channel.name)}_${input.targetId}`;
            if (!input.workspaceId && channel.workspaceId) {
              input.workspaceId = channel.workspaceId.toString();
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to resolve target details for ${input.targetType}:${input.targetId}`,
          err,
        );
      }
    }

    if (input.workspaceId) {
      let wsFolder = input.workspaceId;
      if (Types.ObjectId.isValid(input.workspaceId)) {
        try {
          const ws = await this.workspacesService.findById(input.workspaceId);
          if (ws) {
            wsFolder = `${slugify(ws.name)}_${input.workspaceId}`;
          }
        } catch {
          wsFolder = input.workspaceId;
        }
      }

      const lowerType = input.targetType
        ? input.targetType.toLowerCase()
        : 'other';
      if (lowerType === 'task' || lowerType === 'tasks') {
        folder = `workspaces/${wsFolder}/${targetFolder}/${getDatePath()}`;
      } else if (lowerType === 'page' || lowerType === 'pages') {
        folder = `workspaces/${wsFolder}/pages/${targetFolder}/${getDatePath()}`;
      } else if (lowerType === 'channel' || lowerType === 'channels') {
        folder = `workspaces/${wsFolder}/chat/channels/${targetFolder}/${getDatePath()}`;
      } else {
        folder = `workspaces/${wsFolder}/attachments/${lowerType}/${targetFolder}/${getDatePath()}`;
      }
    } else {
      const lowerType = input.targetType
        ? input.targetType.toLowerCase()
        : 'other';
      if (lowerType === 'channel' || lowerType === 'channels') {
        folder = `chat/channels/${targetFolder}/${getDatePath()}`;
      } else {
        folder = `attachments/${lowerType}/${targetFolder}/${getDatePath()}`;
      }
    }

    const isImage = file.mimetype.startsWith('image/');
    const cleanName = slugifyFilename(file.originalname);
    const hash = generateShortHash(4);
    const ext = extname(file.originalname);
    const publicId = isImage
      ? `${cleanName}_${hash}`
      : `${cleanName}_${hash}${ext}`;

    const result = await this.cloudinaryService.uploadFile(file, folder, {
      resourceType: isImage ? 'image' : 'raw',
      publicId,
    });

    const attachment = new this.attachmentModel({
      workspaceId: input.workspaceId
        ? new Types.ObjectId(input.workspaceId)
        : undefined,
      uploadedBy: new Types.ObjectId(userId),
      filename: file.filename || file.originalname,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      storageKey: result.publicId,
      url: result.url,
      cloudinaryPublicId: result.publicId,
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
        {
          _id: new Types.ObjectId(id),
          isDeleted: { $ne: true },
          uploadedBy: new Types.ObjectId(userId),
        },
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
