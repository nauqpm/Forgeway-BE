import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import axios from 'axios';
import { MAX_ATTACHMENT_SIZE } from '../constants/attachment-file.constants';
import { attachmentFileFilter } from '../validators/attachment-file.validator';
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
import { TaskAttachmentService } from '../services/task-attachment.service';

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
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE },
      fileFilter: attachmentFileFilter,
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Redirect to attachment URL',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({
    description: 'Workspace, task, or attachment not found',
  })
  async downloadTaskAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const attachment = await this.taskAttachmentService.getAttachmentUrl(
      workspaceId,
      taskId,
      attachmentId,
      user.userId,
    );
    this.logAttachmentAccess(request, {
      type: SECURITY_EVENT_TYPES.TASK_ATTACHMENT_DOWNLOADED,
      userId: user.userId,
      workspaceId,
      taskId,
      attachmentId,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
    });

    const fetchUrl = attachment.downloadUrl || attachment.url;
    if (fetchUrl.startsWith('http')) {
      try {
        const streamResponse = await axios.get(fetchUrl, {
          responseType: 'stream',
        });
        response.setHeader('Content-Type', attachment.mimeType);
        response.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
        );
        streamResponse.data.pipe(response);
        return;
      } catch (_err) {
        return response.redirect(attachment.url);
      }
    }
    return response.redirect(attachment.url);
  }

  @Get(':attachmentId/preview')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Preview task attachment file inline' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Redirect to previewable attachment URL',
  })
  @ApiBadRequestResponse({
    description: 'Attachment type does not support preview',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({
    description: 'Workspace, task, or attachment not found',
  })
  async previewTaskAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const attachment = await this.taskAttachmentService.getAttachmentUrl(
      workspaceId,
      taskId,
      attachmentId,
      user.userId,
    );
    this.logAttachmentAccess(request, {
      type: SECURITY_EVENT_TYPES.TASK_ATTACHMENT_PREVIEWED,
      userId: user.userId,
      workspaceId,
      taskId,
      attachmentId,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
    });

    const fetchUrl = attachment.downloadUrl || attachment.url;
    if (fetchUrl.startsWith('http')) {
      try {
        const streamResponse = await axios.get(fetchUrl, {
          responseType: 'stream',
        });
        response.setHeader('Content-Type', attachment.mimeType);
        response.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
        );
        streamResponse.data.pipe(response);
        return;
      } catch (_err) {
        return response.redirect(attachment.url);
      }
    }
    return response.redirect(attachment.url);
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
}
