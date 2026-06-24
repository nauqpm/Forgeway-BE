import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { TaskCommentNotificationService } from './task-comment-notification.service';

describe('TaskCommentNotificationService', () => {
  let service: TaskCommentNotificationService;
  let notificationsService: jest.Mocked<
    Pick<
      NotificationsService,
      'notifyCommentMentioned' | 'notifyTaskCommentCreated'
    >
  >;
  let workspaceMemberService: jest.Mocked<
    Pick<WorkspaceMemberService, 'filterMembers'>
  >;

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const memberId = new Types.ObjectId().toString();
  const commentId = new Types.ObjectId().toString();

  function makeComment(opts?: { mentions?: Types.ObjectId[] }): any {
    return {
      _id: new Types.ObjectId(commentId),
      workspaceId: new Types.ObjectId(workspaceId),
      mentions: opts?.mentions ?? [],
    };
  }

  function makeTask(opts?: {
    assigneeId?: Types.ObjectId | null;
    reporterId?: Types.ObjectId | null;
  }): any {
    return {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      title: 'Test task',
      assigneeId: opts?.assigneeId ?? new Types.ObjectId(memberId),
      reporterId: opts?.reporterId ?? new Types.ObjectId(userId),
    };
  }

  beforeEach(async () => {
    notificationsService = {
      notifyCommentMentioned: jest.fn(),
      notifyTaskCommentCreated: jest.fn(),
    };

    workspaceMemberService = {
      filterMembers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCommentNotificationService,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: WorkspaceMemberService, useValue: workspaceMemberService },
      ],
    }).compile();

    service = module.get(TaskCommentNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('notifyTaskComment', () => {
    it('notifies mentioned users filtered to workspace members', async () => {
      const comment = makeComment({
        mentions: [new Types.ObjectId(memberId)],
      });
      const task = makeTask();
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );

      await service.notifyTaskComment(comment, task, userId);

      expect(notificationsService.notifyCommentMentioned).toHaveBeenCalledWith({
        recipientIds: [memberId],
        actorId: userId,
        workspaceId,
        taskId,
        taskKey: task.key,
        taskTitle: task.title,
        commentId: comment._id.toString(),
      });
      // memberId was mentioned AND is assignee → deduplicated from task comment notification
      // userId is the actor/reporter → filtered out
      // → no additional task comment notification sent
      expect(
        notificationsService.notifyTaskCommentCreated,
      ).not.toHaveBeenCalled();
    });

    it('does not notify the actor as a mention recipient', async () => {
      const comment = makeComment({
        mentions: [new Types.ObjectId(userId)],
      });
      const task = makeTask();
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );

      await service.notifyTaskComment(comment, task, userId);

      expect(
        notificationsService.notifyCommentMentioned,
      ).not.toHaveBeenCalled();
      expect(notificationsService.notifyTaskCommentCreated).toHaveBeenCalled();
    });

    it('does not notify comment created for assignee/reporter who was already mentioned', async () => {
      const comment = makeComment({
        mentions: [new Types.ObjectId(memberId)],
      });
      const task = makeTask({
        assigneeId: new Types.ObjectId(memberId),
      });
      // memberId is the only mention AND the only assignee/reporter
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );

      await service.notifyTaskComment(comment, task, userId);

      // Only mention notification — no dup for assignee
      expect(notificationsService.notifyCommentMentioned).toHaveBeenCalledTimes(
        1,
      );
      expect(
        notificationsService.notifyTaskCommentCreated,
      ).not.toHaveBeenCalled();
    });

    it('skips notifications when workspaceId cannot be resolved', async () => {
      const comment = makeComment();
      const task = makeTask();
      // Remove workspaceId from task
      delete task.workspaceId;

      await service.notifyTaskComment(comment, task, userId);

      expect(
        notificationsService.notifyCommentMentioned,
      ).not.toHaveBeenCalled();
      expect(
        notificationsService.notifyTaskCommentCreated,
      ).not.toHaveBeenCalled();
    });

    it('does not throw when notification service fails', async () => {
      const comment = makeComment({
        mentions: [new Types.ObjectId(memberId)],
      });
      const task = makeTask();
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );
      notificationsService.notifyCommentMentioned.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.notifyTaskComment(comment, task, userId),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyAddedMentions', () => {
    it('notifies newly added mention recipients', async () => {
      const comment = makeComment();
      const task = makeTask();
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );

      await service.notifyAddedMentions(comment, task, userId, [memberId]);

      expect(notificationsService.notifyCommentMentioned).toHaveBeenCalledWith({
        recipientIds: [memberId],
        actorId: userId,
        workspaceId,
        taskId,
        taskKey: task.key,
        taskTitle: task.title,
        commentId: comment._id.toString(),
      });
    });

    it('does nothing when addedMentionIds is empty', async () => {
      const comment = makeComment();
      const task = makeTask();

      await service.notifyAddedMentions(comment, task, userId, []);

      expect(
        notificationsService.notifyCommentMentioned,
      ).not.toHaveBeenCalled();
      expect(workspaceMemberService.filterMembers).not.toHaveBeenCalled();
    });

    it('filters out the actor from added mentions', async () => {
      const comment = makeComment();
      const task = makeTask();

      await service.notifyAddedMentions(comment, task, userId, [userId]);

      expect(
        notificationsService.notifyCommentMentioned,
      ).not.toHaveBeenCalled();
    });

    it('does not notify users who are no longer workspace members', async () => {
      const comment = makeComment();
      const task = makeTask();
      workspaceMemberService.filterMembers.mockResolvedValue([]);

      await service.notifyAddedMentions(comment, task, userId, [memberId]);

      expect(workspaceMemberService.filterMembers).toHaveBeenCalledWith(
        workspaceId,
        [memberId],
      );
      expect(
        notificationsService.notifyCommentMentioned,
      ).not.toHaveBeenCalled();
    });

    it('does not throw when notification service fails', async () => {
      const comment = makeComment();
      const task = makeTask();
      workspaceMemberService.filterMembers.mockImplementation(
        (_wsId: string, ids: string[]) => Promise.resolve(ids),
      );
      notificationsService.notifyCommentMentioned.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.notifyAddedMentions(comment, task, userId, [memberId]),
      ).resolves.toBeUndefined();
    });
  });
});
