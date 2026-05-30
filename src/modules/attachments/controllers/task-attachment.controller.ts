import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
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
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttachmentDto } from '../dtos/attachment.dto';
import { TaskAttachmentService } from '../services/task-attachment.service';

@ApiTags('Task Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board/:taskId/attachments')
export class TaskAttachmentController {
  constructor(private readonly taskAttachmentService: TaskAttachmentService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Upload attachment to a task' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: HttpStatus.CREATED, type: AttachmentDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs, missing file, or archived task is read-only' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
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
    return this.taskAttachmentService.findByTask(workspaceId, taskId, user.userId);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Soft delete a task attachment' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({ description: 'Invalid IDs or archived task is read-only' })
  @ApiForbiddenResponse({ description: 'Workspace access denied or not attachment uploader' })
  @ApiNotFoundResponse({ description: 'Workspace, task, or attachment not found' })
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
}