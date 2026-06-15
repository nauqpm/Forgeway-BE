import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { AttachmentMapper } from '../mappers/attachment.mapper';
import { Attachment } from '../schemas/attachment.schema';
import { AttachmentService } from './attachment.service';
import { TaskAttachmentService } from './task-attachment.service';

describe('TaskAttachmentService', () => {
  let service: TaskAttachmentService;
  let attachmentModel: any;
  let taskModel: { findOne: jest.Mock };
  let workspacesService: jest.Mocked<WorkspacesService>;
  let workspaceMemberService: jest.Mocked<WorkspaceMemberService>;
  let attachmentService: jest.Mocked<AttachmentService>;
  let attachmentMapper: jest.Mocked<AttachmentMapper>;
  let taskActivitiesService: jest.Mocked<TaskActivitiesService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let cwdSpy: jest.SpyInstance<string, []>;

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const file = {
    filename: 'test-file.png',
    originalname: 'test.png',
    mimetype: 'image/png',
    size: 1234,
  };
  const testCwd = resolve('C:/tmp/al-task-attachment-service-tests');
  const uploadsDir = resolve(testCwd, 'uploads');
  const storedFileName = 'test-stream-attachment.txt';
  const storedFilePath = resolve(uploadsDir, storedFileName);
  const nestedStorageKey = `tasks/2026/06/08/${storedFileName}`;
  const nestedStoredFilePath = resolve(uploadsDir, nestedStorageKey);

  beforeEach(async () => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(testCwd);
    attachmentModel = jest.fn();
    attachmentModel.findOne = jest.fn();
    attachmentModel.find = jest.fn();
    taskModel = { findOne: jest.fn() };
    workspacesService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesService>;
    workspaceMemberService = {
      isMember: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceMemberService>;
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
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAttachmentService,
        { provide: getModelToken(Attachment.name), useValue: attachmentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: WorkspaceMemberService, useValue: workspaceMemberService },
        { provide: AttachmentService, useValue: attachmentService },
        { provide: AttachmentMapper, useValue: attachmentMapper },
        { provide: TaskActivitiesService, useValue: taskActivitiesService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(TaskAttachmentService);
  });

  afterEach(() => {
    if (existsSync(storedFilePath)) {
      unlinkSync(storedFilePath);
    }
    if (existsSync(nestedStoredFilePath)) {
      unlinkSync(nestedStoredFilePath);
    }
    cwdSpy.mockRestore();
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
    const mapped = {
      id: attachment._id.toString(),
      originalName: file.originalname,
    };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(task),
    });
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

    // eslint-disable-next-line @typescript-eslint/unbound-method
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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(taskActivitiesService.recordAttachmentAdded).toHaveBeenCalledWith(
      task,
      userId,
      attachment._id.toString(),
      file.originalname,
    );
  });

  it('rejects uploading attachment on archived task', async () => {
    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
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

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(attachmentService.create).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(taskActivitiesService.recordAttachmentAdded).not.toHaveBeenCalled();
  });
  it('returns download stream and increments download count', async () => {
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(storedFilePath, 'hello attachment');

    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false,
    };
    const attachment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      uploadedBy: new Types.ObjectId(userId),
      originalName: 'hello.txt',
      mimeType: 'text/plain',
      size: 16,
      storageKey: storedFileName,
      downloadCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(task),
    });
    attachmentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(attachment),
      }),
    });

    const result = await service.getDownloadStream(
      workspaceId,
      taskId,
      attachment._id.toString(),
      userId,
    );

    expect(result.mimeType).toBe('text/plain');
    expect(result.originalName).toBe('hello.txt');
    expect(attachment.downloadCount).toBe(1);
    expect(attachment.save).toHaveBeenCalled();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      result.stream.on('end', resolvePromise);
      result.stream.on('error', rejectPromise);
      result.stream.resume();
    });
  });

  it('previews jpg attachments when stored mime type is generic', async () => {
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(storedFilePath, 'jpg bytes');

    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false,
    };
    const attachment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      uploadedBy: new Types.ObjectId(userId),
      originalName: 'anh-test.jpg',
      filename: storedFileName,
      mimeType: 'application/octet-stream',
      size: 9,
      storageKey: storedFileName,
    };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(task),
    });
    attachmentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(attachment),
      }),
    });

    const result = await service.getPreviewStream(
      workspaceId,
      taskId,
      attachment._id.toString(),
      userId,
    );

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.originalName).toBe('anh-test.jpg');
    await new Promise<void>((resolvePromise, rejectPromise) => {
      result.stream.on('end', resolvePromise);
      result.stream.on('error', rejectPromise);
      result.stream.resume();
    });
  });
  it('falls back to attachment url when legacy storage key points at uploads root', async () => {
    mkdirSync(resolve(uploadsDir, 'tasks', '2026', '06', '08'), {
      recursive: true,
    });
    writeFileSync(nestedStoredFilePath, 'hello attachment');

    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false,
    };
    const attachment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      uploadedBy: new Types.ObjectId(userId),
      originalName: 'hello.txt',
      mimeType: 'text/plain',
      size: 16,
      storageKey: storedFileName,
      url: `/uploads/${nestedStorageKey}`,
      downloadCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(task),
    });
    attachmentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(attachment),
      }),
    });

    const result = await service.getDownloadStream(
      workspaceId,
      taskId,
      attachment._id.toString(),
      userId,
    );

    expect(result.originalName).toBe('hello.txt');
    expect(attachment.downloadCount).toBe(1);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      result.stream.on('end', resolvePromise);
      result.stream.on('error', rejectPromise);
      result.stream.resume();
    });
  });

  it('rejects preview for unsupported mime type', async () => {
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false,
    };
    const attachment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      uploadedBy: new Types.ObjectId(userId),
      originalName: 'archive.zip',
      mimeType: 'application/zip',
      size: 16,
      storageKey: storedFileName,
    };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(task),
    });
    attachmentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(attachment),
      }),
    });

    await expect(
      service.getPreviewStream(
        workspaceId,
        taskId,
        attachment._id.toString(),
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
