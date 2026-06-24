import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { TaskCommentNotificationService } from './task-comment-notification.service';
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
      'isMember' | 'filterNonMembers' | 'filterMembers' | 'getMembers'
    >
  >;
  let commentMapper: jest.Mocked<Pick<CommentMapper, 'mapToDto' | 'mapToDtos'>>;
  let taskActivitiesService: jest.Mocked<
    Pick<
      TaskActivitiesService,
      'recordCommentAdded' | 'recordCommentUpdated' | 'recordCommentDeleted'
    >
  >;
  let taskCommentNotificationService: jest.Mocked<
    Pick<
      TaskCommentNotificationService,
      'notifyTaskComment' | 'notifyAddedMentions'
    >
  >;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const memberId = new Types.ObjectId().toString();
  const memberFullName = 'John Doe';
  const secondMemberId = new Types.ObjectId().toString();
  const secondMemberFullName = 'Jane Smith';
  const nonMemberName = 'Evil Hacker';

  /** Helper: returns a workspace member shaped like getMembers() returns */
  function memberEntry(
    id: string,
    fullName: string,
    role = 'member',
  ): { userId: { _id: Types.ObjectId; fullName: string }; role: string } {
    return {
      userId: { _id: new Types.ObjectId(id), fullName },
      role,
    };
  }

  /** Helper: set getMembers to return the given members */
  function mockGetMembers(
    ...entries: {
      userId: { _id: Types.ObjectId; fullName: string };
      role: string;
    }[]
  ): void {
    workspaceMemberService.getMembers.mockResolvedValue(entries);
  }

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

    workspacesService = { findById: jest.fn() };

    workspaceMemberService = {
      isMember: jest.fn(),
      filterNonMembers: jest.fn(),
      filterMembers: jest.fn(),
      getMembers: jest.fn(),
    };

    commentMapper = {
      mapToDto: jest.fn(),
      mapToDtos: jest.fn(),
    };

    taskActivitiesService = {
      recordCommentAdded: jest.fn(),
      recordCommentUpdated: jest.fn(),
      recordCommentDeleted: jest.fn(),
    };

    taskCommentNotificationService = {
      notifyTaskComment: jest.fn(),
      notifyAddedMentions: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCommentService,
        { provide: getModelToken(Comment.name), useValue: commentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: WorkspaceMemberService, useValue: workspaceMemberService },
        { provide: CommentMapper, useValue: commentMapper },
        { provide: TaskActivitiesService, useValue: taskActivitiesService },
        {
          provide: TaskCommentNotificationService,
          useValue: taskCommentNotificationService,
        },
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
      mockGetMembers(memberEntry(userId, 'Current User'));

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

    it('rejects mentioning non-workspace members by parsing @Name from content', async () => {
      workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
      workspaceMemberService.isMember.mockResolvedValue(true);
      taskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(task),
      });
      // Only "John Doe" is a workspace member
      mockGetMembers(memberEntry(memberId, memberFullName));

      await expect(
        service.createForTask(
          workspaceId,
          taskId,
          { content: `Hello @${nonMemberName}` },
          userId,
        ),
      ).rejects.toThrow(
        `Mentioned users not found in workspace: ${nonMemberName}`,
      );

      expect(workspaceMemberService.getMembers).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(commentModel).not.toHaveBeenCalled();
    });

    it('accepts mentioning workspace members via @Name in content', async () => {
      mockSuccess();
      mockGetMembers(
        memberEntry(userId, 'Current User'),
        memberEntry(memberId, memberFullName),
      );

      const result = await service.createForTask(
        workspaceId,
        taskId,
        { content: `Hello @${memberFullName}` },
        userId,
      );

      expect(result).toEqual(mapped);
      expect(workspaceMemberService.getMembers).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(commentModel).toHaveBeenCalledWith(
        expect.objectContaining({
          content: `Hello @${memberFullName}`,
          mentions: [new Types.ObjectId(memberId)],
        }),
      );
    });

    it('does not call getMembers when content has no @ patterns', async () => {
      mockSuccess();
      mockGetMembers(memberEntry(userId, 'Current User'));

      const result = await service.createForTask(
        workspaceId,
        taskId,
        { content: 'No mentions here' },
        userId,
      );

      expect(result).toEqual(mapped);
      // No @ patterns → getMembers should NOT be called
      expect(workspaceMemberService.getMembers).not.toHaveBeenCalled();
      // No @ patterns → mentions should be empty
      expect(commentModel).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'No mentions here',
          mentions: [],
        }),
      );
    });
  });

  describe('updateForTask', () => {
    const originalCommentId = new Types.ObjectId().toString();
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

    let existingComment: any;
    let saveMock: jest.Mock;
    let populateMock: jest.Mock;
    const mapped = {
      id: originalCommentId,
      content: 'Updated content',
      mentions: [memberId],
    };

    function mockUpdateBase(): void {
      workspacesService.findById.mockResolvedValue({ _id: workspaceId } as any);
      workspaceMemberService.isMember.mockResolvedValue(true);
      taskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(task),
      });

      existingComment = {
        _id: new Types.ObjectId(originalCommentId),
        workspaceId: new Types.ObjectId(workspaceId),
        targetType: 'task',
        targetId: taskId,
        authorId: new Types.ObjectId(userId),
        content: 'Original content',
        mentions: [],
        editedAt: undefined,
        isDeleted: false,
        $set: undefined,
      };

      saveMock = jest.fn().mockResolvedValue(existingComment);
      existingComment.save = saveMock;

      populateMock = jest.fn().mockResolvedValue(existingComment);
      existingComment.populate = populateMock;

      commentModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingComment),
        }),
      });

      commentMapper.mapToDto.mockReturnValue(mapped as any);
    }

    it('rejects updating when user is not the author', async () => {
      mockUpdateBase();
      existingComment.authorId = new Types.ObjectId(memberId);

      await expect(
        service.updateForTask(
          workspaceId,
          taskId,
          originalCommentId,
          { content: 'Hacked content' },
          userId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(saveMock).not.toHaveBeenCalled();
    });

    it('rejects updating with mention of non-workspace member via @Name in content', async () => {
      mockUpdateBase();
      mockGetMembers(memberEntry(memberId, memberFullName));

      await expect(
        service.updateForTask(
          workspaceId,
          taskId,
          originalCommentId,
          { content: `Hello @${nonMemberName}` },
          userId,
        ),
      ).rejects.toThrow(
        `Mentioned users not found in workspace: ${nonMemberName}`,
      );

      expect(workspaceMemberService.getMembers).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('updates comment with mention of workspace member via @Name in content', async () => {
      mockUpdateBase();
      mockGetMembers(
        memberEntry(userId, 'Current User'),
        memberEntry(memberId, memberFullName),
      );
      workspaceMemberService.filterMembers.mockResolvedValue([memberId]);
      taskCommentNotificationService.notifyAddedMentions.mockResolvedValue();

      const result = await service.updateForTask(
        workspaceId,
        taskId,
        originalCommentId,
        { content: `Hello @${memberFullName}` },
        userId,
      );

      expect(result).toEqual(mapped);
      expect(workspaceMemberService.getMembers).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(existingComment.content).toBe(`Hello @${memberFullName}`);
      expect(existingComment.mentions).toEqual([new Types.ObjectId(memberId)]);
      expect(existingComment.editedAt).toBeInstanceOf(Date);
      expect(saveMock).toHaveBeenCalled();
      expect(taskActivitiesService.recordCommentUpdated).toHaveBeenCalled();
      expect(
        taskCommentNotificationService.notifyAddedMentions,
      ).toHaveBeenCalledWith(expect.anything(), expect.anything(), userId, [
        memberId,
      ]);
    });

    it('persists the update before activity, realtime, and mention notifications', async () => {
      mockUpdateBase();
      mockGetMembers(memberEntry(memberId, memberFullName));
      taskCommentNotificationService.notifyAddedMentions.mockResolvedValue();

      await service.updateForTask(
        workspaceId,
        taskId,
        originalCommentId,
        { content: `Hello @${memberFullName}` },
        userId,
      );

      const saveOrder = saveMock.mock.invocationCallOrder[0];
      const activityOrder =
        taskActivitiesService.recordCommentUpdated.mock.invocationCallOrder[0];
      const realtimeOrder = eventEmitter.emit.mock.invocationCallOrder[0];
      const notificationOrder =
        taskCommentNotificationService.notifyAddedMentions.mock
          .invocationCallOrder[0];

      expect(saveOrder).toBeLessThan(activityOrder);
      expect(activityOrder).toBeLessThan(realtimeOrder);
      expect(realtimeOrder).toBeLessThan(notificationOrder);
    });

    it('does not notify a user who was already mentioned', async () => {
      mockUpdateBase();
      existingComment.mentions = [new Types.ObjectId(memberId)];
      mockGetMembers(memberEntry(memberId, memberFullName));

      await service.updateForTask(
        workspaceId,
        taskId,
        originalCommentId,
        { content: `Updated text for @${memberFullName}` },
        userId,
      );

      expect(
        taskCommentNotificationService.notifyAddedMentions,
      ).toHaveBeenCalledWith(expect.anything(), expect.anything(), userId, []);
      expect(workspaceMemberService.filterMembers).not.toHaveBeenCalled();
    });

    it('notifies only mentions newly added during the update', async () => {
      mockUpdateBase();
      existingComment.mentions = [new Types.ObjectId(memberId)];
      mockGetMembers(
        memberEntry(memberId, memberFullName),
        memberEntry(secondMemberId, secondMemberFullName),
      );

      await service.updateForTask(
        workspaceId,
        taskId,
        originalCommentId,
        {
          content: `Hello @${memberFullName}, meet @${secondMemberFullName}`,
        },
        userId,
      );

      expect(
        taskCommentNotificationService.notifyAddedMentions,
      ).toHaveBeenCalledWith(expect.anything(), expect.anything(), userId, [
        secondMemberId,
      ]);
    });

    it('clears mentions when updated content has no @ symbols', async () => {
      mockUpdateBase();
      existingComment.mentions = [new Types.ObjectId(memberId)];

      const result = await service.updateForTask(
        workspaceId,
        taskId,
        originalCommentId,
        { content: 'Just content update, no symbols' },
        userId,
      );

      expect(result).toEqual(mapped);
      expect(existingComment.content).toBe('Just content update, no symbols');
      // No @ symbols → getMembers should NOT be called
      expect(workspaceMemberService.getMembers).not.toHaveBeenCalled();
      // Mentions should be empty because no @Name in content
      expect(existingComment.mentions).toEqual([]);
      expect(saveMock).toHaveBeenCalled();
      expect(taskActivitiesService.recordCommentUpdated).toHaveBeenCalled();
      // Service delegates to notification service even when no new mentions added
      expect(
        taskCommentNotificationService.notifyAddedMentions,
      ).toHaveBeenCalledWith(expect.anything(), expect.anything(), userId, []);
    });

    it('rejects updating with content containing @Name of someone outside workspace', async () => {
      mockUpdateBase();
      mockGetMembers(memberEntry(memberId, memberFullName));

      const rawPayload = {
        content: `Hacked @${nonMemberName}`,
      };

      await expect(
        service.updateForTask(
          workspaceId,
          taskId,
          originalCommentId,
          rawPayload,
          userId,
        ),
      ).rejects.toThrow(
        `Mentioned users not found in workspace: ${nonMemberName}`,
      );

      expect(saveMock).not.toHaveBeenCalled();
      expect(taskActivitiesService.recordCommentUpdated).not.toHaveBeenCalled();
    });

    it('rejects updating on archived task', async () => {
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
        service.updateForTask(
          workspaceId,
          taskId,
          originalCommentId,
          { content: 'Nope' },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(taskActivitiesService.recordCommentUpdated).not.toHaveBeenCalled();
    });
  });
});
