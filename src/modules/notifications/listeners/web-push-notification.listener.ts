import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DOMAIN_EVENT_TYPES,
  NotificationCreatedEvent,
} from '../../../shared/events/domain-events';
import { WebPushService } from '../services/web-push.service';

@Injectable()
export class WebPushNotificationListener {
  private readonly logger = new Logger(WebPushNotificationListener.name);

  constructor(private readonly webPushService: WebPushService) {}

  @OnEvent(DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED, { async: true })
  async handleNotificationCreated(
    event: NotificationCreatedEvent,
  ): Promise<void> {
    try {
      await this.webPushService.sendNotification(event.data.notification);
    } catch {
      this.logger.warn({
        event: 'web_push_notification_listener_failed',
        notificationId: event.data.notificationId,
      });
    }
  }
}
