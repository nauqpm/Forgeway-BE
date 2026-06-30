import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import axios from 'axios';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DocumentsService } from '../services/documents.service';
import { UploadDocumentDto } from '../dtos/upload-document.dto';
import { UpdateDocumentDto } from '../dtos/update-document.dto';
import {
  AttachDocumentDto,
  DetachDocumentDto,
} from '../dtos/attach-document.dto';
import { CreateOnlineDocumentDto } from '../dtos/create-online-document.dto';
import { UpdateDocumentContentDto } from '../dtos/update-document-content.dto';
import { UpdateDocumentWorkspacesDto } from '../dtos/update-document-workspaces.dto';

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documentsService.upload(userId, file, dto);
  }

  @Post('create-online')
  createOnline(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateOnlineDocumentDto,
  ) {
    return this.documentsService.createOnline(userId, dto);
  }

  @Post('import/docx')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.docx')) {
          return cb(
            new BadRequestException('Only .docx files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async importDocx(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const html = await this.documentsService.importDocx(file.buffer);
    return { html };
  }

  @Get()
  listMine(@CurrentUser('userId') userId: string) {
    return this.documentsService.listMine(userId);
  }

  // Super admin: get all documents
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  async listAllAdmin() {
    return this.documentsService.listAll();
  }

  @Get(':id')
  getMineById(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.documentsService.getMineById(userId, id);
  }

  @Get(':id/content')
  getContent(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.documentsService.getContent(userId, id);
  }

  @Post(':id/versions')
  createVersion(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body('label') label: string,
  ) {
    if (!label?.trim()) {
      throw new BadRequestException('Version label is required');
    }
    return this.documentsService.createVersion(userId, id, label);
  }

  @Get(':id/versions')
  getVersions(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.documentsService.getVersions(userId, id);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documentsService.restoreVersion(userId, id, versionId);
  }

  @Patch(':id')
  updateMine(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.updateMine(userId, id, dto);
  }

  @Patch(':id/content')
  updateContent(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentContentDto,
  ) {
    return this.documentsService.updateContent(userId, id, dto);
  }

  @Delete(':id')
  deleteMine(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.documentsService.deleteMine(userId, id);
  }

  @Post(':id/attach')
  attach(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: AttachDocumentDto,
  ) {
    return this.documentsService.attach(userId, id, dto);
  }

  @Post(':id/detach')
  detach(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: DetachDocumentDto,
  ) {
    return this.documentsService.detach(userId, id, dto);
  }

  @Patch(':id/workspaces')
  updateWorkspaces(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentWorkspacesDto,
  ) {
    return this.documentsService.updateWorkspaces(userId, id, dto);
  }

  @Get('workspace/:workspaceId')
  listByWorkspace(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.documentsService.listByWorkspace(userId, workspaceId);
  }

  @Get(':id/download')
  async download(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.resolveDownloadable(userId, id);
    if (doc.storagePath.startsWith('http')) {
      let fetchUrl = doc.storagePath;
      if (doc.cloudinaryPublicId) {
        try {
          const { v2: cloudinary } = require('cloudinary');
          fetchUrl = cloudinary.utils.private_download_url(
            doc.cloudinaryPublicId,
            '',
            {
              resource_type: doc.mimeType?.startsWith('image/')
                ? 'image'
                : 'raw',
              type: doc.documentType === 'online' ? 'authenticated' : 'upload',
            },
          );
        } catch (_err) {
          // Fallback
        }
      }
      try {
        const streamResponse = await axios.get(fetchUrl, {
          responseType: 'stream',
        });
        res.setHeader('Content-Type', doc.mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
        );
        streamResponse.data.pipe(res);
        return;
      } catch (_err) {
        return res.redirect(doc.storagePath);
      }
    }
    return res.download(doc.storagePath, doc.originalName);
  }

  @Get(':id/export/docx')
  async exportDocx(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.documentsService.exportOnlineToDocx(
      userId,
      id,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    return res.end(buffer);
  }

  @Get(':id/view')
  async view(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.resolveDownloadable(userId, id);
    if (doc.storagePath.startsWith('http')) {
      let fetchUrl = doc.storagePath;
      if (doc.cloudinaryPublicId) {
        try {
          const { v2: cloudinary } = require('cloudinary');
          fetchUrl = cloudinary.utils.private_download_url(
            doc.cloudinaryPublicId,
            '',
            {
              resource_type: doc.mimeType?.startsWith('image/')
                ? 'image'
                : 'raw',
              type: doc.documentType === 'online' ? 'authenticated' : 'upload',
            },
          );
        } catch (_err) {
          // Fallback
        }
      }
      try {
        const streamResponse = await axios.get(fetchUrl, {
          responseType: 'stream',
        });
        res.setHeader('Content-Type', doc.mimeType);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(doc.originalName)}"`,
        );
        streamResponse.data.pipe(res);
        return;
      } catch (_err) {
        return res.redirect(doc.storagePath);
      }
    }
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.originalName)}"`,
    );
    return res.sendFile(doc.storagePath);
  }

  @Get(':id/preview')
  async preview(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.resolveDownloadable(userId, id);
    const html = await this.documentsService.renderPreviewHtml(doc);
    if (!html) {
      return res
        .status(415)
        .json({ message: 'Preview not supported for this file type' });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
}
