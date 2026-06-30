import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import axios from 'axios';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_SIZE } from '../constants/attachment-file.constants';
import { attachmentFileFilter } from '../validators/attachment-file.validator';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Image, ImageDocument } from '../../images/schemas/image.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateAttachmentInput } from '../dtos/attachment-input.dto';
import { AttachmentService } from '../services/attachment.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';

@ApiTags('Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly attachmentService: AttachmentService,
    private readonly cloudinaryService: CloudinaryService,
    @InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List generic attachments by target' })
  async findByTarget(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ) {
    return this.attachmentService.findByTarget(targetType, targetId);
  }

  @Get('download-by-url')
  @ApiOperation({ summary: 'Download attachment by URL' })
  async downloadByUrl(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new BadRequestException('URL parameter is required');
    }

    const attachment = await this.attachmentService.findByUrl(url);
    let isImageModel = false;
    let fileObj: any = attachment;

    if (!attachment) {
      // If not found in attachments, check images collection (for uploaded images)
      const image = await this.imageModel.findOne({ url }).exec();
      if (image) {
        fileObj = image;
        isImageModel = true;
      }
    }

    if (!fileObj || !fileObj.url) {
      throw new NotFoundException(
        'Attachment or Image not found or has no URL',
      );
    }

    const attachmentUrl = fileObj.url;

    try {
      if (isImageModel) {
        await this.imageModel.updateOne(
          { _id: fileObj._id },
          { $inc: { downloadCount: 1 } },
        );
      } else {
        await this.attachmentService.incrementDownloadCount(
          fileObj._id.toString(),
        );
      }
    } catch (_e) {
      // Ignore
    }

    if (fileObj.cloudinaryPublicId) {
      let fetchUrl: string = attachmentUrl;
      try {
        fetchUrl = this.cloudinaryService.getPrivateDownloadUrl(
          fileObj.cloudinaryPublicId,
          fileObj.mimeType?.startsWith('image/') ? 'image' : 'raw',
        );
      } catch (_err) {
        // Fallback
      }

      try {
        const streamResponse = await axios.get(fetchUrl, {
          responseType: 'stream',
        });
        res.setHeader(
          'Content-Type',
          fileObj.mimeType || 'application/octet-stream',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(fileObj.originalName || fileObj.filename || 'file')}"`,
        );
        streamResponse.data.pipe(res);
        return;
      } catch (_err) {
        return res.redirect(attachmentUrl);
      }
    }

    return res.redirect(attachmentUrl);
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
        workspaceId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE },
      fileFilter: attachmentFileFilter,
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
    const workspaceId = req.body?.workspaceId || req.query?.workspaceId;
    const workspaceName = req.body?.workspaceName || req.query?.workspaceName;
    const targetName = req.body?.targetName || req.query?.targetName;

    if (!targetType || !['task', 'page', 'channel'].includes(targetType)) {
      throw new BadRequestException(
        'targetType must be "task", "page" or "channel"',
      );
    }
    if (!targetId) {
      throw new BadRequestException('targetId is required');
    }

    const input: CreateAttachmentInput = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      targetType: targetType as 'task' | 'page' | 'channel',
      targetId,
      workspaceId,
      workspaceName,
      targetName,
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
