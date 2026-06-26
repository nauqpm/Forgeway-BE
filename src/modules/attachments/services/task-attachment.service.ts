import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { extname } from 'path';
import { Model, Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import {
  TaskAttachmentAddedEvent,
  TaskAttachmentDeletedEvent,
} from '../../../shared/events/domain-events/task';
import { AttachmentDto } from '../dtos/attachment.dto';
import { AttachmentMapper } from '../mappers/attachment.mapper';
import { Attachment, AttachmentDocument } from '../schemas/attachment.schema';
import { AttachmentService } from './attachment.service';

@Injectable()
export class TaskAttachmentService {
  constructor(
    @InjectModel(Attachment.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly attachmentService: AttachmentService,
    private readonly attachmentMapper: AttachmentMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async uploadForTask(
    workspaceId: string,
    taskId: string,
    file: Express.Multer.File,
    userId: string,
  ): Promise<AttachmentDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const task = await this.getAttachableTask(workspaceId, taskId, userId);

    const attachment = await this.attachmentService.create(
      {
        workspaceId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        targetType: 'task',
        targetId: taskId,
        targetName: task.title,
      },
      file,
      userId,
    );

    await this.taskActivitiesService.recordAttachmentAdded(
      task,
      userId,
      attachment._id.toString(),
      attachment.originalName,
    );

    const populated = await this.findTaskAttachmentDocument(
      workspaceId,
      taskId,
      attachment._id.toString(),
    );

    if (!populated) {
      throw new NotFoundException('Attachment not found');
    }

    const attachmentDto = this.attachmentMapper.mapToDto(populated);
    this.publishAttachmentAddedEvent(task, userId, attachmentDto);

    return attachmentDto;
  }

  async findByTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<AttachmentDto[]> {
    await this.getReadableTask(workspaceId, taskId, userId);

    const attachments = await this.attachmentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: 'task',
        targetId: taskId,
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'fullName email avatar')
      .exec();

    return this.attachmentMapper.mapToDtos(attachments);
  }

  async deleteForTask(
    workspaceId: string,
    taskId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    const task = await this.getAttachableTask(workspaceId, taskId, userId);
    const attachment = await this.findTaskAttachmentDocument(
      workspaceId,
      taskId,
      attachmentId,
    );

    if (!attachment) {
      throw new NotFoundException(
        `Attachment with ID ${attachmentId} not found`,
      );
    }

    const uploadedById =
      attachment.uploadedBy instanceof Types.ObjectId
        ? attachment.uploadedBy.toString()
        : (
            attachment.uploadedBy as { _id?: Types.ObjectId | string }
          )?._id?.toString();

    if (uploadedById !== userId) {
      throw new ForbiddenException('You can only delete your own attachments');
    }

    attachment.isDeleted = true;
    attachment.deletedAt = new Date();
    attachment.deletedBy = new Types.ObjectId(userId);
    await attachment.save();
    await this.taskActivitiesService.recordAttachmentDeleted(
      task,
      userId,
      attachment._id.toString(),
      attachment.originalName,
    );
    this.publishAttachmentDeletedEvent(
      task,
      userId,
      attachment._id.toString(),
      attachment.originalName,
    );
  }

  async getAttachmentUrl(
    workspaceId: string,
    taskId: string,
    attachmentId: string,
    userId: string,
  ): Promise<{
    url: string;
    downloadUrl?: string;
    originalName: string;
    mimeType: string;
  }> {
    await this.getReadableTask(workspaceId, taskId, userId);
    const attachment = await this.getReadableAttachment(
      workspaceId,
      taskId,
      attachmentId,
    );

    attachment.downloadCount += 1;
    await attachment.save();

    const mimeType = this.resolveMimeType(
      attachment.mimeType,
      attachment.originalName || attachment.filename || attachment.storageKey,
    );

    let downloadUrl = attachment.url;
    if (attachment.cloudinaryPublicId) {
      try {
        const { v2: cloudinary } = require('cloudinary');
        downloadUrl = cloudinary.utils.private_download_url(
          attachment.cloudinaryPublicId,
          '',
          {
            resource_type: mimeType?.startsWith('image/') ? 'image' : 'raw',
            type: 'upload',
          },
        );
      } catch (_err) {
        // Fallback
      }
    }

    return {
      url: attachment.url || '',
      downloadUrl,
      originalName: attachment.originalName,
      mimeType,
    };
  }

  private resolveMimeType(mimeType?: string, fileName?: string): string {
    const normalized = mimeType?.trim().toLowerCase();
    if (normalized && normalized !== 'application/octet-stream') {
      return normalized;
    }

    switch (extname(fileName ?? '').toLowerCase()) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.pdf':
        return 'application/pdf';
      case '.txt':
        return 'text/plain';
      default:
        return normalized || 'application/octet-stream';
    }
  }

  private isPreviewable(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return (
      normalized.startsWith('image/') ||
      normalized === 'application/pdf' ||
      normalized === 'text/plain'
    );
  }

  private publishAttachmentAddedEvent(
    task: TaskDocument,
    actorId: string,
    attachment: AttachmentDto,
  ): void {
    const event = new TaskAttachmentAddedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: task._id.toString(),
      taskKey: task.key,
      actorId,
      version: task.version,
      attachmentId: attachment.id,
      attachment,
    });

    this.eventEmitter.emit(event.type, event);
  }

  private publishAttachmentDeletedEvent(
    task: TaskDocument,
    actorId: string,
    attachmentId: string,
    fileName?: string,
  ): void {
    const event = new TaskAttachmentDeletedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: task._id.toString(),
      taskKey: task.key,
      actorId,
      version: task.version,
      attachmentId,
      fileName,
    });

    this.eventEmitter.emit(event.type, event);
  }

  private async getReadableTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDocument> {
    this.validateObjectId(workspaceId, 'Workspace');
    this.validateObjectId(taskId, 'Task');
    await this.workspacesService.findById(workspaceId);
    await this.assertWorkspaceMember(workspaceId, userId);

    const task = await this.taskModel
      .findOne({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return task;
  }

  private async getAttachableTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDocument> {
    const task = await this.getReadableTask(workspaceId, taskId, userId);

    if (task.isArchived) {
      throw new BadRequestException('Archived task attachments are read-only');
    }

    return task;
  }

  private async getReadableAttachment(
    workspaceId: string,
    taskId: string,
    attachmentId: string,
  ): Promise<AttachmentDocument> {
    const attachment = await this.findTaskAttachmentDocument(
      workspaceId,
      taskId,
      attachmentId,
    );

    if (!attachment) {
      throw new NotFoundException(
        `Attachment with ID ${attachmentId} not found`,
      );
    }

    return attachment;
  }

  private async findTaskAttachmentDocument(
    workspaceId: string,
    taskId: string,
    attachmentId: string,
  ): Promise<AttachmentDocument | null> {
    if (!Types.ObjectId.isValid(attachmentId)) {
      return null;
    }

    return this.attachmentModel
      .findOne({
        _id: new Types.ObjectId(attachmentId),
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: 'task',
        targetId: taskId,
        isDeleted: { $ne: true },
      })
      .populate('uploadedBy', 'fullName email avatar')
      .exec();
  }

  private async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `${label} must be a valid MongoDB ObjectId`,
      );
    }
  }
}
