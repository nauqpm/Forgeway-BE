import {
  TaskCreatedEvent,
  TaskMovedEvent,
  TaskReorderedEvent,
} from '../../../shared/events/domain-events/task';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { NotificationsService } from './notifications.service';
import { TaskNotificationService } from './task-notification.service';

describe('TaskNotificationService', () => {
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
      filterMembers: jest
        .fn()
        .mockImplementation((_workspaceId: string, recipientIds: string[]) =>
          Promise.resolve(recipientIds),
        ),
    } as unknown as WorkspaceMemberService;

    return {
      service: new TaskNotificationService(
        notificationsService,
        workspaceMemberService,
      ),
      notificationsService,
      workspaceMemberService,
    };
  };

  it('notifies the assignee when an assigned task is created', async () => {
    const { service, notificationsService } = createDependencies();

    await service.handleTaskCreated(createEvent(assigneeId));

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
    const { service, notificationsService } = createDependencies();

    await service.handleTaskCreated(createEvent(null));

    expect(notificationsService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  it('does not propagate notification failures to the task event flow', async () => {
    const { service, notificationsService } = createDependencies();
    jest
      .spyOn(notificationsService, 'notifyTaskAssigned')
      .mockRejectedValue(new Error('DB unavailable'));

    await expect(
      service.handleTaskCreated(createEvent(assigneeId)),
    ).resolves.toBeUndefined();
  });

  it('notifies workspace-member stakeholders when a task status changes', async () => {
    const { service, notificationsService, workspaceMemberService } =
      createDependencies();

    await service.handleTaskStatusChanged(
      createMoveEvent('todo', 'inprogress'),
    );

    expect(workspaceMemberService.filterMembers).toHaveBeenCalledWith(
      workspaceId,
      [assigneeId, reporterId],
    );
    expect(notificationsService.notifyTaskStatusChanged).toHaveBeenCalledWith({
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

  it('does not notify when status remains the same', async () => {
    const { service, notificationsService, workspaceMemberService } =
      createDependencies();
    const movedEvent = createMoveEvent('todo', 'todo');
    const event = new TaskReorderedEvent({
      ...movedEvent.data,
      beforeTaskId: '507f1f77bcf86cd799439016',
    });

    await service.handleTaskStatusChanged(event);

    expect(workspaceMemberService.filterMembers).not.toHaveBeenCalled();
    expect(notificationsService.notifyTaskStatusChanged).not.toHaveBeenCalled();
  });

  it('excludes former workspace members from status notifications', async () => {
    const { service, notificationsService, workspaceMemberService } =
      createDependencies();
    jest
      .spyOn(workspaceMemberService, 'filterMembers')
      .mockResolvedValue([assigneeId]);

    await service.handleTaskStatusChanged(createMoveEvent('todo', 'done'));

    expect(notificationsService.notifyTaskStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [assigneeId] }),
    );
  });

  it('deduplicates stakeholders and excludes the actor before membership filtering', async () => {
    const { service, workspaceMemberService } = createDependencies();
    const baseEvent = createMoveEvent('todo', 'inprogress');
    const event = new TaskMovedEvent({
      ...baseEvent.data,
      task: {
        ...baseEvent.data.task,
        assigneeId: actorId,
        reporterId: actorId,
      },
    });

    await service.handleTaskStatusChanged(event);

    expect(workspaceMemberService.filterMembers).not.toHaveBeenCalled();
  });

  it('does not notify when no candidate remains a workspace member', async () => {
    const { service, notificationsService, workspaceMemberService } =
      createDependencies();
    jest.spyOn(workspaceMemberService, 'filterMembers').mockResolvedValue([]);

    await service.handleTaskStatusChanged(
      createMoveEvent('inprogress', 'done'),
    );

    expect(notificationsService.notifyTaskStatusChanged).not.toHaveBeenCalled();
  });

  it('does not propagate membership lookup failures', async () => {
    const { service, workspaceMemberService } = createDependencies();
    jest
      .spyOn(workspaceMemberService, 'filterMembers')
      .mockRejectedValue(new Error('Workspace lookup failed'));

    await expect(
      service.handleTaskStatusChanged(createMoveEvent('todo', 'done')),
    ).resolves.toBeUndefined();
  });

  it('does not propagate status notification persistence failures', async () => {
    const { service, notificationsService } = createDependencies();
    jest
      .spyOn(notificationsService, 'notifyTaskStatusChanged')
      .mockRejectedValue(new Error('Notification insert failed'));

    await expect(
      service.handleTaskStatusChanged(createMoveEvent('todo', 'done')),
    ).resolves.toBeUndefined();
  });
});
