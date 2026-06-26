import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Image, ImageDocument } from '../schemas/image.schema';
import { CreateImageDto, ImageType } from '../dtos/create-image.dto';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Page, PageDocument } from '../../pages/schemas/page.schema';
import { Channel, ChannelDocument } from '../../chat/schemas/channel.schema';

import {
  slugify,
  slugifyFilename,
  generateShortHash,
  decodeFilename,
} from '../../cloudinary/cloudinary.utils';

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    @InjectModel(Image.name) private imageModel: Model<ImageDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Page.name) private readonly pageModel: Model<PageDocument>,
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    dto: CreateImageDto,
    file: Express.Multer.File,
    userId: string,
  ): Promise<ImageDocument> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    file.originalname = decodeFilename(file.originalname);

    const isAvatar =
      dto.type === ImageType.AVATAR ||
      dto.targetType === 'avatar' ||
      file.fieldname === 'avatar' ||
      file.fieldname === 'avatars' ||
      dto.type === ('avatars' as any);

    let folder = 'general';
    let resolvedWorkspaceId: string | undefined = dto.workspaceId;
    let channelType: string | undefined = undefined;

    if (isAvatar) {
      folder = 'avatars';
    } else {
      const targetType = dto.targetType;
      const targetId = dto.targetId;
      let targetFolder = targetId;

      // 1. Phân giải workspaceId từ các Model nếu chưa truyền, đồng thời lấy tên/tiêu đề đối tượng
      if (targetType && targetId && Types.ObjectId.isValid(targetId)) {
        try {
          const lowerType = targetType.toLowerCase();
          if (dto.targetName) {
            targetFolder = `${slugify(dto.targetName)}_${targetId}`;
            if (lowerType === 'channel' || lowerType === 'channels') {
              const channel = await this.channelModel
                .findById(new Types.ObjectId(targetId))
                .select('type workspaceId')
                .exec();
              if (channel) {
                channelType = channel.type;
                if (!resolvedWorkspaceId && channel.workspaceId) {
                  resolvedWorkspaceId = channel.workspaceId.toString();
                }
              }
            }
          } else {
            if (lowerType === 'task' || lowerType === 'tasks') {
              const task = await this.taskModel
                .findById(new Types.ObjectId(targetId))
                .select('title workspaceId')
                .exec();
              if (task) {
                if (!resolvedWorkspaceId) {
                  resolvedWorkspaceId = task.workspaceId?.toString();
                }
                targetFolder = `${slugify(task.title)}_${targetId}`;
              }
            } else if (lowerType === 'page' || lowerType === 'pages') {
              const page = await this.pageModel
                .findById(new Types.ObjectId(targetId))
                .select('title workspaceId')
                .exec();
              if (page) {
                if (!resolvedWorkspaceId) {
                  resolvedWorkspaceId = page.workspaceId?.toString();
                }
                targetFolder = `${slugify(page.title)}_${targetId}`;
              }
            } else if (lowerType === 'channel' || lowerType === 'channels') {
              const channel = await this.channelModel
                .findById(new Types.ObjectId(targetId))
                .select('name type workspaceId')
                .exec();
              if (channel) {
                if (!resolvedWorkspaceId) {
                  resolvedWorkspaceId = channel.workspaceId?.toString();
                }
                targetFolder = `${slugify(channel.name)}_${targetId}`;
                channelType = channel.type;
              }
            }
          }
        } catch (err) {
          this.logger.warn(
            `Failed to resolve target details for ${targetType}:${targetId}`,
            err,
          );
        }
      }

      // 2. Xác định cấu trúc thư mục Cloudinary
      if (resolvedWorkspaceId) {
        let wsFolder = resolvedWorkspaceId;
        if (dto.workspaceName) {
          wsFolder = `${slugify(dto.workspaceName)}_${resolvedWorkspaceId}`;
        } else if (Types.ObjectId.isValid(resolvedWorkspaceId)) {
          try {
            const ws =
              await this.workspacesService.findById(resolvedWorkspaceId);
            if (ws) {
              wsFolder = `${slugify(ws.name)}_${resolvedWorkspaceId}`;
            }
          } catch {
            wsFolder = resolvedWorkspaceId;
          }
        }

        const lowerType = targetType ? targetType.toLowerCase() : 'other';
        if (lowerType === 'task' || lowerType === 'tasks') {
          folder = `workspaces/${wsFolder}/tasks/${targetFolder}`;
        } else if (lowerType === 'page' || lowerType === 'pages') {
          folder = `workspaces/${wsFolder}/pages/${targetFolder}`;
        } else if (lowerType === 'channel' || lowerType === 'channels') {
          folder = `workspaces/${wsFolder}/chat/${targetFolder}`;
        } else {
          folder = `workspaces/${wsFolder}/attachments/${lowerType}/${targetFolder}`;
        }
      } else {
        // Chat general/DM/Announcement hoặc upload ngoài Workspace
        const lowerType = targetType ? targetType.toLowerCase() : 'other';
        if (lowerType === 'channel' || lowerType === 'channels') {
          if (channelType === 'dm') {
            folder = `chat/dm/${targetFolder}`;
          } else {
            folder = `chat/global/${targetFolder}`;
          }
        } else if (targetType && targetId) {
          folder = `attachments/${lowerType}/${targetFolder}`;
        } else {
          folder = 'general';
        }
      }
    }

    const cleanName = slugifyFilename(file.originalname);
    const hash = generateShortHash(4);
    const publicId = `${cleanName}_${hash}`;

    this.logger.log(
      `Uploading image to Cloudinary folder: ${folder} with publicId: ${publicId}`,
    );
    const result = await this.cloudinaryService.uploadFile(file, folder, {
      publicId,
    });

    const isChannel = dto.targetType?.toLowerCase() === 'channel' || dto.targetType?.toLowerCase() === 'channels';

    const image = new this.imageModel({
      uploadedBy: new Types.ObjectId(userId),
      filename: file.filename || file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: result.url,
      cloudinaryPublicId: result.publicId,
      thumbnailUrl: dto.thumbnailUrl,
      type: dto.type || (isAvatar ? ImageType.AVATAR : 'other'),
      targetId: dto.targetId,
      targetType: dto.targetType,
      channelId: isChannel && dto.targetId ? new Types.ObjectId(dto.targetId) : undefined,
      workspaceId: resolvedWorkspaceId
        ? new Types.ObjectId(resolvedWorkspaceId)
        : undefined,
      downloadCount: 0,
    });

    return image.save();
  }

  async createMultiple(
    dtos: CreateImageDto[],
    files: Express.Multer.File[],
    userId: string,
  ): Promise<ImageDocument[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Files are required');
    }

    const imagePromises = files.map((file, index) => {
      const dto = dtos[index] || {};
      return this.create(dto, file, userId);
    });

    return Promise.all(imagePromises);
  }

  async findById(id: string): Promise<ImageDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid image ID');
    }

    const image = await this.imageModel.findById(id).exec();
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    return image;
  }

  async findByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ImageDocument[]> {
    return this.imageModel
      .find({ type: targetType, targetId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByUser(userId: string): Promise<ImageDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    return this.imageModel
      .find({ uploadedBy: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findAll(query: {
    targetType?: string;
    targetId?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    images: ImageDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { targetType, targetId, userId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (targetType) filter.type = targetType;
    if (targetId) filter.targetId = targetId;
    if (userId) filter.uploadedBy = new Types.ObjectId(userId);

    const [images, total] = await Promise.all([
      this.imageModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.imageModel.countDocuments(filter).exec(),
    ]);

    return { images, total, page, limit };
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const image = await this.findById(id);

    if (image.cloudinaryPublicId) {
      await this.cloudinaryService.deleteFile(image.cloudinaryPublicId);
    } else {
      const filePath = join(process.cwd(), 'uploads', image.filename);
      try {
        await fs.unlink(filePath);
      } catch {
        console.warn(`File not found on disk: ${filePath}`);
      }
    }

    await this.imageModel.findByIdAndDelete(id).exec();

    return { success: true, message: 'Image deleted successfully' };
  }

  async incrementDownloadCount(id: string): Promise<ImageDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid image ID');
    }

    const image = await this.imageModel
      .findByIdAndUpdate(id, { $inc: { downloadCount: 1 } }, { new: true })
      .exec();

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return image;
  }

  async update(id: string, updateData: Partial<Image>): Promise<ImageDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid image ID');
    }

    const image = await this.imageModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return image;
  }
}
