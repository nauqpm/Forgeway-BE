import {
  TaskCreatedEvent,
  TaskMovedEvent,
  TaskReorderedEvent,
} from '../../../shared/events/domain-events/task';
import { TaskNotificationService } from '../services/task-notification.service';
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
    const taskNotificationService = {
      handleTaskCreated: jest.fn().mockResolvedValue(undefined),
      handleTaskStatusChanged: jest.fn().mockResolvedValue(undefined),
    } as unknown as TaskNotificationService;

    return {
      listener: new TaskNotificationListener(taskNotificationService),
      taskNotificationService,
    };
  };

  it('delegates TASK_CREATED to TaskNotificationService', async () => {
    const { listener, taskNotificationService } = createDependencies();
    const event = createEvent(assigneeId);

    await listener.handleTaskCreated(event);

    expect(taskNotificationService.handleTaskCreated).toHaveBeenCalledWith(
      event,
    );
  });

  it('delegates TASK_MOVED to TaskNotificationService', async () => {
    const { listener, taskNotificationService } = createDependencies();
    const event = createMoveEvent('todo', 'inprogress');

    await listener.handleTaskMoved(event);

    expect(
      taskNotificationService.handleTaskStatusChanged,
    ).toHaveBeenCalledWith(event);
  });

  it('delegates TASK_REORDERED to TaskNotificationService', async () => {
    const { listener, taskNotificationService } = createDependencies();
    const event = new TaskReorderedEvent({
      ...createMoveEvent('todo', 'inprogress').data,
      beforeTaskId: '507f1f77bcf86cd799439016',
    });

    await listener.handleTaskReordered(event);

    expect(
      taskNotificationService.handleTaskStatusChanged,
    ).toHaveBeenCalledWith(event);
  });
});
