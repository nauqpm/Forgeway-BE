import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { Task } from '../../tasks/schemas/task.schema';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { CommentMapper } from '../mappers/comment.mapper';
import { Comment } from '../schemas/comment.schema';
import { TaskCommentService } from './task-comment.service';

describe('TaskCommentService', () => {
  let service: TaskCommentService;
  let commentModel: any;
  let taskModel: { findOne: jest.Mock };
  let workspacesService: jest.Mocked<Pick<WorkspacesService, 'findById'>>;
  let workspaceMemberService: jest.Mocked<
    Pick<
      WorkspaceMemberService,
      'isMember' | 'filterNonMembers' | 'filterMembers'
    >
  >;
  let commentMapper: jest.Mocked<Pick<CommentMapper, 'mapToDto' | 'mapToDtos'>>;
  let taskActivitiesService: jest.Mocked<
    Pick<
      TaskActivitiesService,
      'recordCommentAdded' | 'recordCommentUpdated' | 'recordCommentDeleted'
    >
  >;
  let notificationsService: jest.Mocked<
    Pick<
      NotificationsService,
      'notifyCommentMentioned' | 'notifyTaskCommentCreated'
    >
  >;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const memberId = new Types.ObjectId().toString();
  const nonMemberId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const saveMock = jest.fn();
    commentModel = jest.fn().mockImplementation(data => ({
      ...data,
      _id: new Types.ObjectId(),
      save: saveMock.mockResolvedValue({ ...data, _id: new Types.ObjectId() }),
    }));
    commentModel.findOne = jest.fn();
    commentModel.find = jest.fn();
    commentModel.countDocuments = jest.fn();

    taskModel = { findOne: jest.fn() };

    workspacesService = { findById: jest.fn() } as any;

    workspaceMemberService = {
      isMember: jest.fn(),
      filterNonMembers: jest.fn(),
      filterMembers: jest.fn(),
    } as any;

    commentMapper = {
      mapToDto: jest.fn(),
      mapToDtos: jest.fn(),
    } as any;

    taskActivitiesService = {
      recordCommentAdded: jest.fn(),
      recordCommentUpdated: jest.fn(),
      recordCommentDeleted: jest.fn(),
    } as any;

    notificationsService = {
      notifyCommentMentioned: jest.fn(),
      notifyTaskCommentCreated: jest.fn(),
    } as any;

    eventEmitter = { emit: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCommentService,
        { provide: getModelToken(Comment.name), useValue: commentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: WorkspaceMemberService, useValue: workspaceMemberService },
        { provide: CommentMapper, useValue: commentMapper },
        { provide: TaskActivitiesService, useValue: taskActivitiesService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(TaskCommentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createForTask', () => {
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      title: 'Test task',
      isArchived: false,
      isDeleted: false,
      assigneeId: new Types.ObjectId(memberId),
      reporterId: new Types.ObjectId(userId),
      version: 1,
    };
    const populatedComment = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      targetType: 'task',
      targetId: taskId,
      authorId: new Types.ObjectId(userId),
      content: 'Looks good',
      mentions: [],
      isDeleted: false,
    };
    const mapped = {
      id: populatedComment._id.toString(),
      content: 'Looks good',
    };

    function mockSuccess(): void {
      workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
      workspaceMemberService.isMember.mockResolvedValue(true);
      workspaceMemberService.filterNonMembers.mockResolvedValue([]);
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );
      taskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(task),
      });
      commentModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(populatedComment),
        }),
      });
      commentMapper.mapToDto.mockReturnValue(mapped as any);
    }

    it('creates task comment scoped to workspace and records activity', async () => {
      mockSuccess();

      const result = await service.createForTask(
        workspaceId,
        taskId,
        { content: 'Looks good' },
        userId,
      );

      expect(result).toEqual(mapped);
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
      workspaceMemberService.isMember.mockResolvedValue(true);
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

    it('rejects mentioning non-workspace members', async () => {
      workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
      workspaceMemberService.isMember.mockResolvedValue(true);
      workspaceMemberService.filterNonMembers.mockResolvedValue([nonMemberId]);
      taskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(task),
      });

      await expect(
        service.createForTask(
          workspaceId,
          taskId,
          { content: 'Hello @outsider', mentions: [nonMemberId] },
          userId,
        ),
      ).rejects.toThrow('Mentioned users must be members of this workspace');

      expect(workspaceMemberService.filterNonMembers).toHaveBeenCalledWith(
        workspaceId,
        [nonMemberId],
      );
      expect(commentModel).not.toHaveBeenCalled();
    });

    it('accepts mentioning workspace members', async () => {
      mockSuccess();
      workspaceMemberService.filterNonMembers.mockResolvedValue([]);

      const result = await service.createForTask(
        workspaceId,
        taskId,
        { content: 'Hello @member', mentions: [memberId] },
        userId,
      );

      expect(result).toEqual(mapped);
      expect(workspaceMemberService.filterNonMembers).toHaveBeenCalledWith(
        workspaceId,
        [memberId],
      );
      expect(commentModel).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello @member',
          mentions: [new Types.ObjectId(memberId)],
        }),
      );
    });

    it('accepts empty mentions array', async () => {
      mockSuccess();

      await service.createForTask(
        workspaceId,
        taskId,
        { content: 'No mentions', mentions: [] },
        userId,
      );

      expect(workspaceMemberService.filterNonMembers).not.toHaveBeenCalled();
    });

    it('accepts undefined mentions', async () => {
      mockSuccess();

      await service.createForTask(
        workspaceId,
        taskId,
        { content: 'No mentions' },
        userId,
      );

      expect(workspaceMemberService.filterNonMembers).not.toHaveBeenCalled();
    });
  });
});
