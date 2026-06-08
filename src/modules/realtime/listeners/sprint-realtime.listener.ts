import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  DOMAIN_EVENT_TYPES,
  DomainEventType,
} from '../../../shared/events/domain-events';
import {
  BaseSprintEvent,
  SprintCreatedEventData,
  SprintEventContext,
} from '../../../shared/events/domain-events/sprint';
import {
  REALTIME_EVENT_TYPES,
  RealtimeEnvelope,
  RealtimeEventType,
  RoomBuilder,
} from '../contracts';
import { RealtimePublisher } from '../publishers/realtime.publisher';

export type SprintRealtimeDomainEvent = BaseSprintEvent<
  DomainEventType,
  SprintCreatedEventData
>;

@Injectable()
export class SprintRealtimeListener {
  private readonly logger = new Logger(SprintRealtimeListener.name);

  constructor(private readonly realtimePublisher: RealtimePublisher) {}

  @OnEvent(DOMAIN_EVENT_TYPES.SPRINT_CREATED, { async: true })
  handleSprintCreated(event: SprintRealtimeDomainEvent): void {
    this.publishSprintEvent(REALTIME_EVENT_TYPES.SPRINT_CREATED, event);
  }

  private publishSprintEvent(
    type: RealtimeEventType,
    event: SprintRealtimeDomainEvent,
  ): void {
    try {
      const room = RoomBuilder.workspace(event.data.workspaceId);
      const envelope = this.buildEnvelope(type, event);

      this.realtimePublisher.emit(room, envelope);
      this.logger.debug(
        `Published realtime sprint event. type=${type}, workspaceId=${event.data.workspaceId}, sprintId=${event.data.sprintId}, room=${room}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish realtime sprint event. type=${type}, workspaceId=${event.data?.workspaceId}, sprintId=${event.data?.sprintId}, reason=${(error as Error).message}`,
      );
    }
  }

  private buildEnvelope<TData extends SprintEventContext>(
    type: RealtimeEventType,
    event: BaseSprintEvent<DomainEventType, TData>,
  ): RealtimeEnvelope<TData> {
    return {
      eventId:
        event.eventId ??
        event.data.eventId ??
        `${type}:${event.data.sprintId}:${event.occurredAt.getTime()}`,
      type,
      correlationId: event.correlationId ?? event.data.correlationId,
      causationId: event.causationId ?? event.data.causationId,
      workspaceId: event.data.workspaceId,
      actorId: event.data.actorId,
      entityId: event.data.sprintId,
      version: event.data.version,
      occurredAt: event.occurredAt.toISOString(),
      data: event.data,
    };
  }
}