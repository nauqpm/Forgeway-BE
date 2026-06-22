import {
  TaskCreatedEvent,
  TaskMovedEvent,
  TaskReorderedEvent,
} from '../../../shared/events/domain-events/task';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { NotificationsService } from '../services/notifications.service';
import { TaskNotificationListener } from './task-notification.listener';

describe('TaskNotificationListener', () => {
  const actorId = '507f1f77bcf86cd799439011';
  const assigneeId = '507f1f77bcf86cd799439012';
  const workspaceId = '507f1f77bcf86cd799439013';
  const taskId = '507f1f77bcf86cd799439014';
  const reporterId = '507f1f77bcf86cd799439015';

  const createEvent = (nextAssigneeId: string | null) =>
    new TaskCreatedEvent({
      workspaceId,
      taskId,
      taskKey: 'TASK-12',
      actorId,
      task: {
        id: taskId,
        key: 'TASK-12',
        title: 'Release checklist',
        type: 'task',
        priority: 'medium',
        status: 'todo',
        assigneeId: nextAssigneeId,
      },
    });

  const createMoveEvent = (
    fromStatus: string,
    toStatus: string,
    nextAssigneeId: string | null = assigneeId,
  ) =>
    new TaskMovedEvent({
      workspaceId,
      taskId,
      taskKey: 'TASK-12',
      actorId,
      fromStatus,
      toStatus,
      task: {
        id: taskId,
        key: 'TASK-12',
        title: 'Release checklist',
        type: 'task',
        priority: 'medium',
        status: toStatus,
        assigneeId: nextAssigneeId,
        reporterId,
      },
    });

  const createDependencies = () => {
    const notificationsService = {
      notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
      notifyTaskStatusChanged: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const workspaceMemberService = {
      filterMembers: jest.fn().mockImplementation(
        (_workspaceId: string, recipientIds: string[]) =>
          Promise.resolve(recipientIds),
      ),
    } as unknown as WorkspaceMemberService;

    return {
      listener: new TaskNotificationListener(
        notificationsService,
        workspaceMemberService,
      ),
      notificationsService,
      workspaceMemberService,
    };
  };

  it('notifies the assignee when an assigned task is created', async () => {
    const { listener, notificationsService } = createDependencies();

    await listener.handleTaskCreated(createEvent(assigneeId));

    expect(notificationsService.notifyTaskAssigned).toHaveBeenCalledWith({
      recipientId: assigneeId,
      actorId,
      workspaceId,
      taskId,
      taskKey: 'TASK-12',
      taskTitle: 'Release checklist',
    });
  });

  it('does not create an assignment notification for an unassigned task', async () => {
    const { listener, notificationsService } = createDependencies();

    await listener.handleTaskCreated(createEvent(null));

    expect(notificationsService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  it('does not propagate notification failures to the task event flow', async () => {
    const { listener, notificationsService } = createDependencies();
    jest
      .spyOn(notificationsService, 'notifyTaskAssigned')
      .mockRejectedValue(new Error('DB unavailable'));

    await expect(
      listener.handleTaskCreated(createEvent(assigneeId)),
    ).resolves.toBeUndefined();
  });

  it('notifies workspace-member stakeholders when a task status changes', async () => {
    const { listener, notificationsService, workspaceMemberService } =
      createDependencies();

    await listener.handleTaskMoved(createMoveEvent('todo', 'inprogress'));

    expect(workspaceMemberService.filterMembers).toHaveBeenCalledWith(
      workspaceId,
      [assigneeId, reporterId],
    );
    expect(
      notificationsService.notifyTaskStatusChanged,
    ).toHaveBeenCalledWith({
      recipientIds: [assigneeId, reporterId],
      actorId,
      workspaceId,
      taskId,
      taskKey: 'TASK-12',
      taskTitle: 'Release checklist',
      fromStatus: 'todo',
      toStatus: 'inprogress',
    });
  });

  it('does not notify when reorder keeps the same status', async () => {
    const { listener, notificationsService, workspaceMemberService } =
      createDependencies();
    const movedEvent = createMoveEvent('todo', 'todo');
    const event = new TaskReorderedEvent({
      ...movedEvent.data,
      beforeTaskId: '507f1f77bcf86cd799439016',
    });

    await listener.handleTaskReordered(event);

    expect(workspaceMemberService.filterMembers).not.toHaveBeenCalled();
    expect(
      notificationsService.notifyTaskStatusChanged,
    ).not.toHaveBeenCalled();
  });

  it('excludes former workspace members from status notifications', async () => {
    const { listener, notificationsService, workspaceMemberService } =
      createDependencies();
    jest
      .spyOn(workspaceMemberService, 'filterMembers')
      .mockResolvedValue([assigneeId]);

    await listener.handleTaskMoved(createMoveEvent('todo', 'done'));

    expect(
      notificationsService.notifyTaskStatusChanged,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [assigneeId] }),
    );
  });
});
