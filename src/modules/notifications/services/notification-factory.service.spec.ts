import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
} from '../constants/notification.constants';
import { NotificationFactoryService } from './notification-factory.service';

describe('NotificationFactoryService', () => {
  const factory = new NotificationFactoryService();

  it('builds a task status changed notification with transition metadata', () => {
    const notification = factory.buildTaskStatusChanged({
      recipientId: '507f1f77bcf86cd799439011',
      actorId: '507f1f77bcf86cd799439012',
      workspaceId: '507f1f77bcf86cd799439013',
      taskId: '507f1f77bcf86cd799439014',
      taskKey: 'TASK-12',
      taskTitle: 'Release checklist',
      fromStatus: 'todo',
      toStatus: 'inprogress',
    });

    expect(notification).toMatchObject({
      type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: '507f1f77bcf86cd799439014',
      title: 'TASK-12 status changed',
      message: 'todo -> inprogress',
      metadata: {
        taskId: '507f1f77bcf86cd799439014',
        taskKey: 'TASK-12',
        taskTitle: 'Release checklist',
        fromStatus: 'todo',
        toStatus: 'inprogress',
      },
    });
  });
});
