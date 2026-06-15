import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  DOMAIN_EVENT_TYPES,
  DomainEventType,
} from '../../../shared/events/domain-events';
import {
  BaseNotificationEvent,
  NotificationCreatedEventData,
  NotificationEventContext,
  NotificationReadAllEventData,
  NotificationReadEventData,
} from '../../../shared/events/domain-events/notification';
import {
  REALTIME_EVENT_TYPES,
  RealtimeEnvelope,
  RealtimeEventType,
  RoomBuilder,
} from '../contracts';
import { RealtimePublisher } from '../publishers/realtime.publisher';

export type NotificationRealtimeEventData =
  | NotificationCreatedEventData
  | NotificationReadEventData
  | NotificationReadAllEventData;

export type NotificationRealtimeDomainEvent = BaseNotificationEvent<
  DomainEventType,
  NotificationRealtimeEventData
>;

@Injectable()
export class NotificationRealtimeListener {
  private readonly logger = new Logger(NotificationRealtimeListener.name);

  constructor(private readonly realtimePublisher: RealtimePublisher) {}

  @OnEvent(DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED, { async: true })
  handleNotificationCreated(event: NotificationRealtimeDomainEvent): void {
    this.publishNotificationEvent(
      REALTIME_EVENT_TYPES.NOTIFICATION_CREATED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.NOTIFICATION_READ, { async: true })
  handleNotificationRead(event: NotificationRealtimeDomainEvent): void {
    this.publishNotificationEvent(
      REALTIME_EVENT_TYPES.NOTIFICATION_READ,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.NOTIFICATION_READ_ALL, { async: true })
  handleNotificationReadAll(event: NotificationRealtimeDomainEvent): void {
    this.publishNotificationEvent(
      REALTIME_EVENT_TYPES.NOTIFICATION_READ_ALL,
      event,
    );
  }

  private publishNotificationEvent(
    type: RealtimeEventType,
    event: NotificationRealtimeDomainEvent,
  ): void {
    try {
      const room = RoomBuilder.user(event.data.recipientId);
      const envelope = this.buildEnvelope(type, event);

      this.realtimePublisher.emit(room, envelope);
      this.logger.debug(
        `Published realtime notification event. type=${type}, recipientId=${event.data.recipientId}, notificationId=${event.data.notificationId}, room=${room}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish realtime notification event. type=${type}, recipientId=${event.data?.recipientId}, notificationId=${event.data?.notificationId}, reason=${(error as Error).message}`,
      );
    }
  }

  private buildEnvelope<TData extends NotificationEventContext>(
    type: RealtimeEventType,
    event: BaseNotificationEvent<DomainEventType, TData>,
  ): RealtimeEnvelope<TData> {
    return {
      eventId:
        event.eventId ??
        event.data.eventId ??
        `${type}:${event.data.notificationId ?? event.data.recipientId}:${event.occurredAt.getTime()}`,
      type,
      correlationId: event.correlationId ?? event.data.correlationId,
      causationId: event.causationId ?? event.data.causationId,
      workspaceId: event.data.workspaceId,
      actorId: event.data.actorId,
      entityId: event.data.notificationId ?? event.data.recipientId,
      version: event.data.version,
      occurredAt: event.occurredAt.toISOString(),
      data: event.data,
    };
  }
}
