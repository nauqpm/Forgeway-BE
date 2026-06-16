import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Request, Response } from 'express';
import { extname } from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getUploadPath } from '../../../config/upload-storage.config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SECURITY_EVENT_TYPES } from '../../audit/constants/audit.constants';
import type { SecurityEventType } from '../../audit/schemas/security-event.schema';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttachmentDto } from '../dtos/attachment.dto';
import {
  TaskAttachmentFileStream,
  TaskAttachmentService,
} from '../services/task-attachment.service';

@ApiTags('Task Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board/:taskId/attachments')
export class TaskAttachmentController {
  constructor(
    private readonly taskAttachmentService: TaskAttachmentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Upload attachment to a task' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: HttpStatus.CREATED, type: AttachmentDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs, missing file, or archived task is read-only',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');

          const uploadPath = getUploadPath('tasks', String(year), month, day);

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
  async uploadTaskAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<AttachmentDto> {
    return this.taskAttachmentService.uploadForTask(
      workspaceId,
      taskId,
      file,
      user.userId,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List task attachments' })
  @ApiResponse({ status: HttpStatus.OK, type: [AttachmentDto] })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  async getTaskAttachments(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AttachmentDto[]> {
    return this.taskAttachmentService.findByTask(
      workspaceId,
      taskId,
      user.userId,
    );
  }

  @Get(':attachmentId/download')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Download task attachment file' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Attachment file stream' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({
    description: 'Workspace, task, attachment, or file not found',
  })
  async downloadTaskAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.taskAttachmentService.getDownloadStream(
      workspaceId,
      taskId,
      attachmentId,
      user.userId,
    );
    this.setFileHeaders(response, file, 'attachment');
    this.logAttachmentAccess(request, {
      type: SECURITY_EVENT_TYPES.TASK_ATTACHMENT_DOWNLOADED,
      userId: user.userId,
      workspaceId,
      taskId,
      attachmentId,
      fileName: file.originalName,
      mimeType: file.mimeType,
    });
    return new StreamableFile(file.stream);
  }

  @Get(':attachmentId/preview')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Preview task attachment file inline' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Previewable attachment file stream',
  })
  @ApiBadRequestResponse({
    description: 'Attachment type does not support preview',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({
    description: 'Workspace, task, attachment, or file not found',
  })
  async previewTaskAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.taskAttachmentService.getPreviewStream(
      workspaceId,
      taskId,
      attachmentId,
      user.userId,
    );
    this.setFileHeaders(response, file, 'inline');
    this.logAttachmentAccess(request, {
      type: SECURITY_EVENT_TYPES.TASK_ATTACHMENT_PREVIEWED,
      userId: user.userId,
      workspaceId,
      taskId,
      attachmentId,
      fileName: file.originalName,
      mimeType: file.mimeType,
    });
    return new StreamableFile(file.stream);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Soft delete a task attachment' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or archived task is read-only',
  })
  @ApiForbiddenResponse({
    description: 'Workspace access denied or not attachment uploader',
  })
  @ApiNotFoundResponse({
    description: 'Workspace, task, or attachment not found',
  })
  async deleteTaskAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.taskAttachmentService.deleteForTask(
      workspaceId,
      taskId,
      attachmentId,
      user.userId,
    );
  }

  private logAttachmentAccess(
    request: Request,
    payload: {
      type: SecurityEventType;
      userId: string;
      workspaceId: string;
      taskId: string;
      attachmentId: string;
      fileName: string;
      mimeType: string;
    },
  ): void {
    this.auditLogService.logRequest(request, {
      type: payload.type,
      severity: 'INFO',
      userId: payload.userId,
      metadata: {
        workspaceId: payload.workspaceId,
        taskId: payload.taskId,
        attachmentId: payload.attachmentId,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
      },
    });
  }
  private setFileHeaders(
    response: Response,
    file: TaskAttachmentFileStream,
    disposition: 'attachment' | 'inline',
  ): void {
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size.toString());
    response.setHeader(
      'Content-Disposition',
      this.buildContentDisposition(disposition, file.originalName),
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }

  private buildContentDisposition(
    disposition: 'attachment' | 'inline',
    originalName: string,
  ): string {
    const fallbackName = this.toAsciiFileName(originalName);
    const encodedName = encodeURIComponent(originalName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');

    return `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
  }

  private toAsciiFileName(fileName: string): string {
    const fallbackName = fileName
      .replace(/[\r\n"]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim();

    return fallbackName || 'attachment';
  }
}
