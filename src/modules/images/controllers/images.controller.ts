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
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ImagesService } from '../services/images.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateImageDto, ImageType } from '../dtos/create-image.dto';

const imageFileFilter = (
  req: any,
  file: Express.Multer.File,
  callback: Function,
) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return callback(
      new Error('Only image files are allowed! (jpg, jpeg, png, gif, webp)'),
      false,
    );
  }
  callback(null, true);
};

@ApiTags('Images')
@Controller('imagesapi')
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Upload single image (Local Storage with Date Structure)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload (jpg, jpeg, png, gif, webp)',
        },
        type: {
          type: 'string',
          enum: ['post', 'property', 'task', 'other', 'avatar'],
          description: 'Module type for folder classification',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded successfully',
    schema: {
      example: {
        success: true,
        message: 'Image uploaded successfully',
        data: {
          _id: '...',
          url: '/uploads/others/2026/06/05/image-123.jpg',
          targetType: 'task',
          targetId: '...',
        },
      },
    },
  })
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateImageDto,
    @Query() query: any,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    // Merge body and query to handle cases where UI sends type in URL
    const dto: CreateImageDto = { ...body, ...query };
    const image = await this.imagesService.create(dto, file, userId);
    return {
      success: true,
      message: image.url.includes('cloudinary')
        ? 'Avatar uploaded to Cloudinary successfully'
        : 'Image uploaded successfully',
      data: image,
    };
  }

  @Post('upload/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload avatar to Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (jpg, jpeg, png, gif, webp)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded successfully',
  })
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    const userId = req.user.userId;

    // The service now handles Cloudinary upload automatically if type is AVATAR
    const image = await this.imagesService.create(
      { type: ImageType.AVATAR, targetId: userId },
      file,
      userId,
    );

    return {
      success: true,
      message: 'Avatar uploaded to Cloudinary successfully',
      url: image.url,
      data: image,
    };
  }

  @Post('upload/multiple')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload multiple images at once (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'List of image files to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Multiple images uploaded successfully',
    schema: {
      example: {
        success: true,
        message: '3 images uploaded successfully',
        data: [{ _id: '...', url: '/uploads/others/2026/06/05/image-123.jpg' }],
      },
    },
  })
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: CreateImageDto,
    @Query() query: any,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    const dto: CreateImageDto = { ...body, ...query };
    // Pass the same dto for all files if only one dto is provided in body
    const dtos = files.map(() => dto);
    const images = await this.imagesService.createMultiple(dtos, files, userId);
    return {
      success: true,
      message: `${images.length} images uploaded successfully`,
      data: images,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get list of images by filter' })
  @ApiResponse({
    status: 200,
    description: 'List of images',
    schema: {
      example: {
        success: true,
        data: [
          {
            _id: '...',
            url: '/uploads/others/2026/06/05/image-123.jpg',
            targetType: 'task',
          },
        ],
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get image info by ID' })
  @ApiResponse({
    status: 200,
    description: 'Image info',
    schema: {
      example: {
        success: true,
        data: {
          _id: '...',
          url: '/uploads/others/2026/06/05/image-123.jpg',
          targetType: 'task',
          downloadCount: 5,
        },
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
  @ApiOperation({ summary: 'Delete image by ID' })
  @ApiResponse({
    status: 200,
    description: 'Image deleted successfully',
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
  @ApiOperation({ summary: 'Increment image view/download count' })
  @ApiResponse({
    status: 200,
    description: 'Download count incremented',
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
