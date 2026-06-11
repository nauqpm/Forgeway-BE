import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  DOMAIN_EVENT_TYPES,
  DomainEventType,
} from '../../../shared/events/domain-events';
import {
  BaseTaskEvent,
  TaskArchivedEventData,
  TaskCreatedEventData,
  TaskDeletedEventData,
  TaskEventContext,
  TaskMovedEventData,
  TaskReorderedEventData,
  TaskRestoredEventData,
  TaskUpdatedEventData,
} from '../../../shared/events/domain-events/task';
import {
  REALTIME_EVENT_TYPES,
  RealtimeEnvelope,
  RealtimeEventType,
  RoomBuilder,
} from '../contracts';
import { RealtimePublisher } from '../publishers/realtime.publisher';

export type TaskRealtimeEventData =
  | TaskCreatedEventData
  | TaskUpdatedEventData
  | TaskMovedEventData
  | TaskReorderedEventData
  | TaskArchivedEventData
  | TaskRestoredEventData
  | TaskDeletedEventData;

export type TaskRealtimeDomainEvent = BaseTaskEvent<
  DomainEventType,
  TaskRealtimeEventData
>;

@Injectable()
export class TaskRealtimeListener {
  private readonly logger = new Logger(TaskRealtimeListener.name);

  constructor(private readonly realtimePublisher: RealtimePublisher) {}

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_CREATED, { async: true })
  handleTaskCreated(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_CREATED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_UPDATED, { async: true })
  handleTaskUpdated(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_UPDATED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_MOVED, { async: true })
  handleTaskMoved(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_MOVED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_REORDERED, { async: true })
  handleTaskReordered(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_REORDERED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_ARCHIVED, { async: true })
  handleTaskArchived(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_ARCHIVED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_RESTORED, { async: true })
  handleTaskRestored(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_RESTORED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_DELETED, { async: true })
  handleTaskDeleted(event: TaskRealtimeDomainEvent): void {
    this.publishTaskEvent(REALTIME_EVENT_TYPES.TASK_DELETED, event);
  }

  private publishTaskEvent(
    type: RealtimeEventType,
    event: TaskRealtimeDomainEvent,
  ): void {
    try {
      const room = RoomBuilder.workspace(event.data.workspaceId);
      const envelope = this.buildEnvelope(type, event);

      this.realtimePublisher.emit(room, envelope);
      this.logger.debug(
        `Published realtime task event. type=${type}, workspaceId=${event.data.workspaceId}, taskId=${event.data.taskId}, room=${room}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish realtime task event. type=${type}, workspaceId=${event.data?.workspaceId}, taskId=${event.data?.taskId}, reason=${(error as Error).message}`,
      );
    }
  }

  private buildEnvelope<TData extends TaskEventContext>(
    type: RealtimeEventType,
    event: BaseTaskEvent<DomainEventType, TData>,
  ): RealtimeEnvelope<TData> {
    return {
      eventId:
        event.eventId ??
        event.data.eventId ??
        `${type}:${event.data.taskId}:${event.occurredAt.getTime()}`,
      type,
      correlationId: event.correlationId ?? event.data.correlationId,
      causationId: event.causationId ?? event.data.causationId,
      workspaceId: event.data.workspaceId,
      actorId: event.data.actorId,
      entityId: event.data.taskId,
      version: event.data.version,
      occurredAt: event.occurredAt.toISOString(),
      data: event.data,
    };
  }
}
