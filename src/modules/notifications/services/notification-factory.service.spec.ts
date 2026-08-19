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

  it('builds a channel invitation notification with navigation metadata', () => {
    const notification = factory.buildChannelInvited({
      recipientId: '507f1f77bcf86cd799439011',
      actorId: '507f1f77bcf86cd799439012',
      workspaceId: '507f1f77bcf86cd799439013',
      channelId: '507f1f77bcf86cd799439014',
      channelName: 'private-planning',
      isPrivate: true,
    });

    expect(notification).toMatchObject({
      type: NOTIFICATION_TYPES.CHANNEL_INVITED,
      entityType: NOTIFICATION_ENTITY_TYPES.CHANNEL,
      entityId: '507f1f77bcf86cd799439014',
      metadata: {
        workspaceId: '507f1f77bcf86cd799439013',
        channelId: '507f1f77bcf86cd799439014',
        channelName: 'private-planning',
        isPrivate: true,
      },
    });
  });

  it('keeps sprint started title compatibility and workspace metadata', () => {
    const notification = factory.buildSprintStarted({
      recipientId: '507f1f77bcf86cd799439011',
      actorId: '507f1f77bcf86cd799439012',
      workspaceId: '507f1f77bcf86cd799439013',
      sprintId: '507f1f77bcf86cd799439014',
      sprintName: 'Sprint 12',
    });

    expect(notification).toMatchObject({
      title: "Sprint 'Sprint 12' has started",
      metadata: {
        workspaceId: '507f1f77bcf86cd799439013',
        sprintId: '507f1f77bcf86cd799439014',
      },
    });
  });

  it('keeps sprint completed title compatibility and workspace metadata', () => {
    const notification = factory.buildSprintCompleted({
      recipientId: '507f1f77bcf86cd799439011',
      actorId: '507f1f77bcf86cd799439012',
      workspaceId: '507f1f77bcf86cd799439013',
      sprintId: '507f1f77bcf86cd799439014',
      sprintName: 'Sprint 12',
    });

    expect(notification).toMatchObject({
      title: "Sprint 'Sprint 12' has been completed",
      metadata: {
        workspaceId: '507f1f77bcf86cd799439013',
        sprintId: '507f1f77bcf86cd799439014',
      },
    });
  });
});
