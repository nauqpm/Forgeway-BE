import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateAttachmentInput } from '../dtos/attachment-input.dto';
import { AttachmentService } from '../services/attachment.service';

@ApiTags('Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Get()
  @ApiOperation({ summary: 'List generic attachments by target' })
  async findByTarget(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ) {
    return this.attachmentService.findByTarget(targetType, targetId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attachment by ID' })
  async findById(@Param('id') id: string) {
    return this.attachmentService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Upload generic attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        targetType: { type: 'string', enum: ['task', 'page'] },
        targetId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          
          // Get module from body or query
          const targetType = req.body?.targetType || req.query?.targetType || 'others';
          const moduleFolder = targetType === 'task' ? 'tasks' : targetType === 'page' ? 'pages' : 'others';
          
          const uploadPath = join('uploads', moduleFolder, String(year), month, day);
          
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const ext = extname(file.originalname);
          callback(null, `${Date.now()}-${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('targetType') bodyTargetType: string,
    @Body('targetId') bodyTargetId: string,
    @Query('targetType') queryTargetType: string,
    @Query('targetId') queryTargetId: string,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const targetType = bodyTargetType || queryTargetType;
    const targetId = bodyTargetId || queryTargetId;

    if (!targetType || !['task', 'page'].includes(targetType)) {
      throw new BadRequestException('targetType must be "task" or "page"');
    }
    if (!targetId) {
      throw new BadRequestException('targetId is required');
    }

    const input: CreateAttachmentInput = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      targetType: targetType as 'task' | 'page',
      targetId,
    };

    return this.attachmentService.create(input, file, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete generic attachment metadata' })
  @ApiResponse({ status: 200, description: 'Attachment soft deleted' })
  async delete(@Param('id') id: string, @Request() req: any) {
    await this.attachmentService.softDelete(id, req.user.userId);
    return { message: 'Attachment deleted successfully' };
  }

  @Post(':id/download')
  @ApiOperation({ summary: 'Increment attachment download count' })
  async incrementDownloadCount(@Param('id') id: string) {
    return this.attachmentService.incrementDownloadCount(id);
  }
}