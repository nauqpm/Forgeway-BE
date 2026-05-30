import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { AttachmentMapper } from '../mappers/attachment.mapper';
import { Attachment } from '../schemas/attachment.schema';
import { AttachmentService } from './attachment.service';
import { TaskAttachmentService } from './task-attachment.service';

describe('TaskAttachmentService', () => {
  let service: TaskAttachmentService;
  let attachmentModel: any;
  let taskModel: { findOne: jest.Mock };
  let workspacesService: jest.Mocked<WorkspacesService>;
  let attachmentService: jest.Mocked<AttachmentService>;
  let attachmentMapper: jest.Mocked<AttachmentMapper>;
  let taskActivitiesService: jest.Mocked<TaskActivitiesService>;

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const file = {
    filename: 'test-file.png',
    originalname: 'test.png',
    mimetype: 'image/png',
    size: 1234,
  };

  beforeEach(async () => {
    attachmentModel = jest.fn();
    attachmentModel.findOne = jest.fn();
    attachmentModel.find = jest.fn();
    taskModel = { findOne: jest.fn() };
    workspacesService = {
      findById: jest.fn(),
      isMember: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesService>;
    attachmentService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AttachmentService>;
    attachmentMapper = {
      mapToDto: jest.fn(),
      mapToDtos: jest.fn(),
    } as unknown as jest.Mocked<AttachmentMapper>;
    taskActivitiesService = {
      recordAttachmentAdded: jest.fn(),
    } as unknown as jest.Mocked<TaskActivitiesService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAttachmentService,
        { provide: getModelToken(Attachment.name), useValue: attachmentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: AttachmentService, useValue: attachmentService },
        { provide: AttachmentMapper, useValue: attachmentMapper },
        { provide: TaskActivitiesService, useValue: taskActivitiesService },
      ],
    }).compile();

    service = module.get(TaskAttachmentService);
  });

  it('uploads task attachment scoped to workspace and records activity', async () => {
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      isArchived: false,
      isDeleted: false,
    };
    const attachment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      uploadedBy: new Types.ObjectId(userId),
      originalName: file.originalname,
    };
    const mapped = { id: attachment._id.toString(), originalName: file.originalname };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspacesService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(task) });
    attachmentService.create.mockResolvedValue(attachment as any);
    attachmentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(attachment),
      }),
    });
    attachmentMapper.mapToDto.mockReturnValue(mapped as any);

    await expect(
      service.uploadForTask(workspaceId, taskId, file, userId),
    ).resolves.toEqual(mapped);

    expect(attachmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        targetType: 'task',
        targetId: taskId,
        originalName: file.originalname,
      }),
      file,
      userId,
    );
    expect(taskActivitiesService.recordAttachmentAdded).toHaveBeenCalledWith(
      task,
      userId,
      attachment._id.toString(),
      file.originalname,
    );
  });

  it('rejects uploading attachment on archived task', async () => {
    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspacesService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: true,
      }),
    });

    await expect(
      service.uploadForTask(workspaceId, taskId, file, userId),
    ).rejects.toThrow(BadRequestException);

    expect(attachmentService.create).not.toHaveBeenCalled();
    expect(taskActivitiesService.recordAttachmentAdded).not.toHaveBeenCalled();
  });
});