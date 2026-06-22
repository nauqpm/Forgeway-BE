import { TaskCreatedEvent } from '../../../shared/events/domain-events/task';
import { NotificationsService } from '../services/notifications.service';
import { TaskNotificationListener } from './task-notification.listener';

describe('TaskNotificationListener', () => {
  const actorId = '507f1f77bcf86cd799439011';
  const assigneeId = '507f1f77bcf86cd799439012';
  const workspaceId = '507f1f77bcf86cd799439013';
  const taskId = '507f1f77bcf86cd799439014';

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

  it('notifies the assignee when an assigned task is created', async () => {
    const notificationsService = {
      notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const listener = new TaskNotificationListener(notificationsService);

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
    const notificationsService = {
      notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const listener = new TaskNotificationListener(notificationsService);

    await listener.handleTaskCreated(createEvent(null));

    expect(notificationsService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  it('does not propagate notification failures to the task event flow', async () => {
    const notificationsService = {
      notifyTaskAssigned: jest.fn().mockRejectedValue(new Error('DB unavailable')),
    } as unknown as NotificationsService;
    const listener = new TaskNotificationListener(notificationsService);

    await expect(
      listener.handleTaskCreated(createEvent(assigneeId)),
    ).resolves.toBeUndefined();
  });
});
