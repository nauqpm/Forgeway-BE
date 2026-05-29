import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { CommentMapper } from '../mappers/comment.mapper';
import { Comment } from '../schemas/comment.schema';
import { TaskCommentService } from './task-comment.service';

describe('TaskCommentService', () => {
  let service: TaskCommentService;
  let commentModel: any;
  let taskModel: { findOne: jest.Mock };
  let workspacesService: jest.Mocked<WorkspacesService>;
  let commentMapper: jest.Mocked<CommentMapper>;
  let taskActivitiesService: jest.Mocked<TaskActivitiesService>;

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const saveMock = jest.fn();
    commentModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: saveMock.mockResolvedValue({
        ...data,
        _id: new Types.ObjectId(),
      }),
    }));
    commentModel.findOne = jest.fn();
    commentModel.find = jest.fn();
    commentModel.countDocuments = jest.fn();

    taskModel = { findOne: jest.fn() };
    workspacesService = {
      findById: jest.fn(),
      isMember: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesService>;
    commentMapper = {
      mapToDto: jest.fn(),
      mapToDtos: jest.fn(),
    } as unknown as jest.Mocked<CommentMapper>;
    taskActivitiesService = {
      recordCommentAdded: jest.fn(),
    } as unknown as jest.Mocked<TaskActivitiesService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCommentService,
        { provide: getModelToken(Comment.name), useValue: commentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: CommentMapper, useValue: commentMapper },
        { provide: TaskActivitiesService, useValue: taskActivitiesService },
      ],
    }).compile();

    service = module.get(TaskCommentService);
  });

  it('creates task comment scoped to workspace and records activity', async () => {
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      isArchived: false,
      isDeleted: false,
    };
    const populatedComment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      authorId: new Types.ObjectId(userId),
      content: 'Looks good',
      isDeleted: false,
    };
    const mapped = { id: populatedComment._id.toString(), content: 'Looks good' };

    workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
    workspacesService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(task) });
    commentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(populatedComment),
      }),
    });
    commentMapper.mapToDto.mockReturnValue(mapped as any);

    await expect(
      service.createForTask(workspaceId, taskId, { content: 'Looks good' }, userId),
    ).resolves.toEqual(mapped);

    expect(commentModel).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: 'task',
        targetId: taskId,
        content: 'Looks good',
      }),
    );
    expect(taskActivitiesService.recordCommentAdded).toHaveBeenCalledWith(
      task,
      userId,
      expect.any(String),
    );
  });

  it('rejects creating comment on archived task', async () => {
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
      service.createForTask(workspaceId, taskId, { content: 'Nope' }, userId),
    ).rejects.toThrow(BadRequestException);

    expect(taskActivitiesService.recordCommentAdded).not.toHaveBeenCalled();
  });
});