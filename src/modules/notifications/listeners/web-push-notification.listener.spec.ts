import { NotificationCreatedEvent } from '../../../shared/events/domain-events/notification';
import { WebPushNotificationListener } from './web-push-notification.listener';

describe('WebPushNotificationListener', () => {
  it('delegates every persisted notification.created event to Web Push', async () => {
    const webPushService = { sendNotification: jest.fn() };
    const listener = new WebPushNotificationListener(webPushService as never);
    const event = new NotificationCreatedEvent({
      recipientId: '507f1f77bcf86cd799439011',
      notificationId: '507f1f77bcf86cd799439012',
      notification: {
        id: '507f1f77bcf86cd799439012',
        recipientId: '507f1f77bcf86cd799439011',
        type: 'CHAT_MENTIONED',
        title: 'Mentioned',
        entityType: 'message',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await listener.handleNotificationCreated(event);

    expect(webPushService.sendNotification).toHaveBeenCalledWith(
      event.data.notification,
    );
  });
});
