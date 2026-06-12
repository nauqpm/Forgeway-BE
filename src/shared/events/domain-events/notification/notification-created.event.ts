import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseNotificationEvent } from './base-notification.event';
import { NotificationCreatedEventData } from './notification-event-payloads';

export class NotificationCreatedEvent extends BaseNotificationEvent<
  typeof DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED,
  NotificationCreatedEventData
> {
  constructor(data: NotificationCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED, data);
  }
}
