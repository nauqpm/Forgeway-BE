import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Image, ImageDocument } from '../schemas/image.schema';
import { CreateImageDto, ImageType } from '../dtos/create-image.dto';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class ImagesService {
  constructor(
    @InjectModel(Image.name) private imageModel: Model<ImageDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(dto: CreateImageDto, file: Express.Multer.File, userId: string): Promise<ImageDocument> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    let url = '';
    
    // Nếu là avatar, tự động đẩy lên Cloudinary (ngay cả khi upload qua API local)
    if (dto.type === ImageType.AVATAR && file.path) {
      const result = await this.cloudinaryService.uploadImageFromPath(file.path, 'avatars');
      url = result.secure_url;
      
      // Xóa file local sau khi đã lên mây
      try {
        await fs.unlink(file.path);
      } catch (err) {
        console.error('Failed to delete local temp file:', err);
      }
    } else if (file.buffer) {
      // Trường hợp upload trực tiếp từ RAM (qua API upload/avatar chuyên dụng)
      // url đã được controller xử lý hoặc xử lý tại đây nếu cần
      url = '/uploads/temp-to-be-overwritten'; 
    } else {
      // Trường hợp lưu local bình thường
      const relativePath = file.destination ? file.destination.replace(/\\/g, '/') : 'uploads/others';
      url = `/${relativePath}/${file.filename}`.replace(/\/+/g, '/');
    }

    const image = new this.imageModel({
      uploadedBy: new Types.ObjectId(userId),
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: url,
      thumbnailUrl: dto.thumbnailUrl,
      type: dto.type || 'other',
      targetId: dto.targetId,
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

    const images = files.map((file, index) => {
      const dto = dtos[index] || {};
      const relativePath = file.destination ? file.destination.replace(/\\/g, '/') : 'uploads/others';
      const url = `/${relativePath}/${file.filename}`.replace(/\/+/g, '/');

      return new this.imageModel({
        uploadedBy: new Types.ObjectId(userId),
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: url,
        thumbnailUrl: dto.thumbnailUrl,
        type: dto.type || 'other',
        targetId: dto.targetId,
        downloadCount: 0,
      });
    });

    return this.imageModel.insertMany(images);
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

  async findByTarget(targetType: string, targetId: string): Promise<ImageDocument[]> {
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
  }): Promise<{ images: ImageDocument[]; total: number; page: number; limit: number }> {
    const { targetType, targetId, userId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (targetType) filter.type = targetType;
    if (targetId) filter.targetId = targetId;
    if (userId) filter.uploadedBy = new Types.ObjectId(userId);

    const [images, total] = await Promise.all([
      this.imageModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.imageModel.countDocuments(filter).exec(),
    ]);

    return { images, total, page, limit };
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const image = await this.findById(id);

    const filePath = join(process.cwd(), 'uploads', image.filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`File not found on disk: ${filePath}`);
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
