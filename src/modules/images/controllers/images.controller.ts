import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Request,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ImagesService } from '../services/images.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateImageDto } from '../dtos/create-image.dto';

const imageFileFilter = (req: any, file: Express.Multer.File, callback: Function) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return callback(new Error('Only image files are allowed! (jpg, jpeg, png, gif, webp)'), false);
  }
  callback(null, true);
};

const storage = diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const originalName = file.originalname.replace(/\.[^/.]+$/, '');
    const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  },
});

@ApiTags('Images')
@Controller('imagesapi')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload single image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File ảnh cần upload (jpg, jpeg, png, gif, webp)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Upload ảnh thành công',
    schema: {
      example: {
        success: true,
        message: 'Image uploaded successfully',
        data: { _id: '...', url: '/uploads/image-123.jpg', targetType: 'task', targetId: '...' },
      },
    },
  })
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateImageDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    const image = await this.imagesService.create(dto, file, userId);
    return {
      success: true,
      message: 'Image uploaded successfully',
      data: image,
    };
  }

  @Post('upload/multiple')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload nhiều ảnh cùng lúc (tối đa 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Danh sách file ảnh cần upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Upload nhiều ảnh thành công',
    schema: {
      example: {
        success: true,
        message: '3 images uploaded successfully',
        data: [{ _id: '...', url: '/uploads/image-123.jpg' }],
      },
    },
  })
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateImageDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    const images = await this.imagesService.createMultiple(files as any, files, userId);
    return {
      success: true,
      message: `${images.length} images uploaded successfully`,
      data: images,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách ảnh theo bộ lọc' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách ảnh',
    schema: {
      example: {
        success: true,
        data: [{ _id: '...', url: '/uploads/image-123.jpg', targetType: 'task' }],
        pagination: { page: 1, limit: 20, total: 50 },
      },
    },
  })
  async findAll(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const images = await this.imagesService.findAll({
      targetType,
      targetId,
      userId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return {
      success: true,
      ...images,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin ảnh theo ID' })
  @ApiResponse({
    status: 200,
    description: 'Thông tin ảnh',
    schema: {
      example: {
        success: true,
        data: { _id: '...', url: '/uploads/image-123.jpg', targetType: 'task', downloadCount: 5 },
      },
    },
  })
  async findById(@Param('id') id: string) {
    const image = await this.imagesService.findById(id);
    return {
      success: true,
      data: image,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Xóa ảnh theo ID' })
  @ApiResponse({
    status: 200,
    description: 'Xóa ảnh thành công',
    schema: {
      example: {
        success: true,
        message: 'Image deleted successfully',
      },
    },
  })
  async delete(@Param('id') id: string) {
    const result = await this.imagesService.delete(id);
    return {
      success: result.success,
      message: result.message,
    };
  }

  @Put(':id/view')
  @ApiOperation({ summary: 'Tăng số lượt xem/download ảnh' })
  @ApiResponse({
    status: 200,
    description: 'Đã tăng số lượt xem',
    schema: {
      example: {
        success: true,
        data: { id: '...', downloadCount: 6 },
      },
    },
  })
  async incrementDownloadCount(@Param('id') id: string) {
    const image = await this.imagesService.incrementDownloadCount(id);
    return {
      success: true,
      data: {
        id: image._id,
        downloadCount: image.downloadCount,
      },
    };
  }
}
