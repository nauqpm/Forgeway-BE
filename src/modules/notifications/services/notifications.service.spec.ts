import { NotificationFactoryService } from './notification-factory.service';
import { NotificationsService } from './notifications.service';
import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
} from '../constants/notification.constants';
import { CreateNotificationInput } from '../interfaces/create-notification-input.interface';
import { NotificationDto } from '../dtos/notification.dto';
import { PushDeliveryStatus } from '../constants/web-push-delivery.constants';

describe('NotificationsService', () => {
  const actorId = '507f1f77bcf86cd799439011';
  const recipientId = '507f1f77bcf86cd799439012';
  const webPushDisabledConfig = {
    enabled: false,
    allowedEndpointHosts: new Set<string>(),
  };
  const webPushEnabledConfig = {
    enabled: true,
    allowedEndpointHosts: new Set(['fcm.googleapis.com']),
  };

  it('does not create an assignment notification for the actor', async () => {
    const factory = new NotificationFactoryService();
    const service = new NotificationsService(
      {} as never,
      {} as never,
      factory,
      {} as never,
      webPushDisabledConfig,
    );
    const create = jest.spyOn(service, 'create').mockResolvedValue(null);

    await service.notifyTaskAssigned({
      recipientId: actorId,
      actorId,
      workspaceId: '507f1f77bcf86cd799439013',
      taskId: '507f1f77bcf86cd799439014',
      taskKey: 'TASK-12',
      taskTitle: 'Release checklist',
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('deduplicates status recipients and excludes the actor', async () => {
    const factory = new NotificationFactoryService();
    const service = new NotificationsService(
      {} as never,
      {} as never,
      factory,
      {} as never,
      webPushDisabledConfig,
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

  it('publishes a created event only after the notification is persisted', async () => {
    const input: CreateNotificationInput = {
      recipientId,
      actorId,
      workspaceId: '507f1f77bcf86cd799439013',
      type: NOTIFICATION_TYPES.TASK_ASSIGNED,
      title: 'You were assigned to TASK-12',
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: '507f1f77bcf86cd799439014',
    };
    const dto: NotificationDto = {
      id: '507f1f77bcf86cd799439015',
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const notification = {};
    const repository = {
      createWithPushDelivery: jest.fn().mockResolvedValue(notification),
    };
    const mapper = {
      mapToDto: jest.fn().mockReturnValue(dto),
    };
    const publisher = {
      publishCreated: jest.fn(),
    };
    const service = new NotificationsService(
      repository as never,
      mapper as never,
      new NotificationFactoryService(),
      publisher as never,
      webPushDisabledConfig,
    );

    await service.create(input);

    expect(repository.createWithPushDelivery).toHaveBeenCalledWith(input, {
      status: 'not_requested',
      nextAttemptAt: null,
    });
    expect(mapper.mapToDto).toHaveBeenCalledWith(notification);
    expect(publisher.publishCreated).toHaveBeenCalledWith(dto);
    expect(
      repository.createWithPushDelivery.mock.invocationCallOrder[0],
    ).toBeLessThan(publisher.publishCreated.mock.invocationCallOrder[0]);
  });

  it('persists pending web push delivery state from injected enabled config', async () => {
    const input: CreateNotificationInput = {
      recipientId,
      actorId,
      workspaceId: '507f1f77bcf86cd799439013',
      type: NOTIFICATION_TYPES.TASK_ASSIGNED,
      title: 'You were assigned to TASK-12',
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: '507f1f77bcf86cd799439014',
    };
    const notification = {};
    const repository = {
      createWithPushDelivery: jest.fn().mockResolvedValue(notification),
    };
    const mapper = {
      mapToDto: jest.fn().mockReturnValue({ id: 'notification' }),
    };
    const publisher = { publishCreated: jest.fn() };
    const service = new NotificationsService(
      repository as never,
      mapper as never,
      new NotificationFactoryService(),
      publisher as never,
      webPushEnabledConfig,
    );

    await service.create(input);

    expect(repository.createWithPushDelivery).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        status: PushDeliveryStatus.PENDING,
        nextAttemptAt: expect.any(Date),
      }),
    );
  });

  it('persists pending web push delivery state with every batch notification when delivery is enabled', async () => {
    const input: CreateNotificationInput = {
      recipientId,
      actorId,
      workspaceId: '507f1f77bcf86cd799439013',
      type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
      title: 'TASK-12 status changed',
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: '507f1f77bcf86cd799439014',
    };
    const repository = { createMany: jest.fn().mockResolvedValue([{}]) };
    const mapper = {
      mapToDto: jest.fn().mockReturnValue({ id: 'notification' }),
    };
    const publisher = { publishManyCreated: jest.fn() };
    const service = new NotificationsService(
      repository as never,
      mapper as never,
      new NotificationFactoryService(),
      publisher as never,
      webPushEnabledConfig,
    );

    await service.createMany([input]);

    expect(repository.createMany).toHaveBeenCalledWith(
      [input],
      expect.objectContaining({
        status: 'pending',
        nextAttemptAt: expect.any(Date),
      }),
    );
  });

  it('publishes batch created events only after notifications are persisted', async () => {
    const input: CreateNotificationInput = {
      recipientId,
      actorId,
      workspaceId: '507f1f77bcf86cd799439013',
      type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
      title: 'TASK-12 status changed',
      entityType: NOTIFICATION_ENTITY_TYPES.TASK,
      entityId: '507f1f77bcf86cd799439014',
    };
    const dto: NotificationDto = {
      id: '507f1f77bcf86cd799439015',
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const notification = {};
    const repository = {
      createMany: jest.fn().mockResolvedValue([notification]),
    };
    const mapper = {
      mapToDto: jest.fn().mockReturnValue(dto),
    };
    const publisher = {
      publishManyCreated: jest.fn(),
    };
    const service = new NotificationsService(
      repository as never,
      mapper as never,
      new NotificationFactoryService(),
      publisher as never,
      webPushDisabledConfig,
    );

    await service.createMany([input]);

    expect(repository.createMany).toHaveBeenCalledWith([input], {
      status: 'not_requested',
      nextAttemptAt: null,
    });
    expect(publisher.publishManyCreated).toHaveBeenCalledWith([dto]);
    expect(repository.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      publisher.publishManyCreated.mock.invocationCallOrder[0],
    );
  });
});
