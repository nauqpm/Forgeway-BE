import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { AttachmentDto } from '../dtos/attachment.dto';
import { AttachmentFile } from '../dtos/attachment-input.dto';
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
    private readonly attachmentService: AttachmentService,
    private readonly attachmentMapper: AttachmentMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
  ) {}

  async uploadForTask(
    workspaceId: string,
    taskId: string,
    file: AttachmentFile,
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

    return this.attachmentMapper.mapToDto(populated);
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
    await this.getAttachableTask(workspaceId, taskId, userId);
    const attachment = await this.findTaskAttachmentDocument(
      workspaceId,
      taskId,
      attachmentId,
    );

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
    }

    if (attachment.uploadedBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own attachments');
    }

    attachment.isDeleted = true;
    attachment.deletedAt = new Date();
    attachment.deletedBy = new Types.ObjectId(userId);
    await attachment.save();
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
    const isMember = await this.workspacesService.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${label} must be a valid MongoDB ObjectId`);
    }
  }
}