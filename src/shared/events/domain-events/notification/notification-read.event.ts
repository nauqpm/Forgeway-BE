import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseNotificationEvent } from './base-notification.event';
import { NotificationReadEventData } from './notification-event-payloads';

export class NotificationReadEvent extends BaseNotificationEvent<
  typeof DOMAIN_EVENT_TYPES.NOTIFICATION_READ,
  NotificationReadEventData
> {
  constructor(data: NotificationReadEventData) {
    super(DOMAIN_EVENT_TYPES.NOTIFICATION_READ, data);
  }
}
