import { NotificationFactoryService } from './notification-factory.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const actorId = '507f1f77bcf86cd799439011';
  const recipientId = '507f1f77bcf86cd799439012';

  it('deduplicates status recipients and excludes the actor', async () => {
    const factory = new NotificationFactoryService();
    const service = new NotificationsService(
      {} as never,
      {} as never,
      factory,
      {} as never,
    );
    const createMany = jest.spyOn(service, 'createMany').mockResolvedValue([]);

    await service.notifyTaskStatusChanged({
      recipientIds: [recipientId, recipientId, actorId],
      actorId,
      workspaceId: '507f1f77bcf86cd799439013',
      taskId: '507f1f77bcf86cd799439014',
      taskKey: 'TASK-12',
      taskTitle: 'Release checklist',
      fromStatus: 'todo',
      toStatus: 'inprogress',
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientId,
        type: 'TASK_STATUS_CHANGED',
      }),
    ]);
  });
});
