import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseNotificationEvent } from './base-notification.event';
import { NotificationReadAllEventData } from './notification-event-payloads';

export class NotificationReadAllEvent extends BaseNotificationEvent<
  typeof DOMAIN_EVENT_TYPES.NOTIFICATION_READ_ALL,
  NotificationReadAllEventData
> {
  constructor(data: NotificationReadAllEventData) {
    super(DOMAIN_EVENT_TYPES.NOTIFICATION_READ_ALL, data);
  }
}
