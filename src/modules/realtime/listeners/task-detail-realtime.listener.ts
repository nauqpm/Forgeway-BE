import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  DOMAIN_EVENT_TYPES,
  DomainEventType,
} from '../../../shared/events/domain-events';
import {
  BaseTaskEvent,
  TaskActivityCreatedEventData,
  TaskAttachmentAddedEventData,
  TaskAttachmentDeletedEventData,
  TaskCommentCreatedEventData,
  TaskCommentDeletedEventData,
  TaskCommentUpdatedEventData,
  TaskCoverUpdatedEventData,
  TaskEventContext,
  TaskLabelsUpdatedEventData,
} from '../../../shared/events/domain-events/task';
import {
  REALTIME_EVENT_TYPES,
  RealtimeEnvelope,
  RealtimeEventType,
  RoomBuilder,
} from '../contracts';
import { RealtimePublisher } from '../publishers/realtime.publisher';

export type TaskDetailRealtimeEventData =
  | TaskCommentCreatedEventData
  | TaskCommentUpdatedEventData
  | TaskCommentDeletedEventData
  | TaskAttachmentAddedEventData
  | TaskAttachmentDeletedEventData
  | TaskLabelsUpdatedEventData
  | TaskCoverUpdatedEventData
  | TaskActivityCreatedEventData;

export type TaskDetailRealtimeDomainEvent = BaseTaskEvent<
  DomainEventType,
  TaskDetailRealtimeEventData
>;

@Injectable()
export class TaskDetailRealtimeListener {
  private readonly logger = new Logger(TaskDetailRealtimeListener.name);

  constructor(private readonly realtimePublisher: RealtimePublisher) {}

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_COMMENT_CREATED, { async: true })
  handleTaskCommentCreated(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_COMMENT_CREATED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_COMMENT_UPDATED, { async: true })
  handleTaskCommentUpdated(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_COMMENT_UPDATED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_COMMENT_DELETED, { async: true })
  handleTaskCommentDeleted(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_COMMENT_DELETED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_ATTACHMENT_ADDED, { async: true })
  handleTaskAttachmentAdded(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_ATTACHMENT_ADDED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_ATTACHMENT_DELETED, { async: true })
  handleTaskAttachmentDeleted(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_ATTACHMENT_DELETED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_LABELS_UPDATED, { async: true })
  handleTaskLabelsUpdated(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_LABELS_UPDATED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_COVER_UPDATED, { async: true })
  handleTaskCoverUpdated(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(REALTIME_EVENT_TYPES.TASK_COVER_UPDATED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.TASK_ACTIVITY_CREATED, { async: true })
  handleTaskActivityCreated(event: TaskDetailRealtimeDomainEvent): void {
    this.publishTaskDetailEvent(
      REALTIME_EVENT_TYPES.TASK_ACTIVITY_CREATED,
      event,
    );
  }

  private publishTaskDetailEvent(
    type: RealtimeEventType,
    event: TaskDetailRealtimeDomainEvent,
  ): void {
    try {
      const room = RoomBuilder.task(event.data.taskId);
      const envelope = this.buildEnvelope(type, event);

      this.realtimePublisher.emit(room, envelope);
      this.logger.debug(
        `Published task detail realtime event. type=${type}, workspaceId=${event.data.workspaceId}, taskId=${event.data.taskId}, room=${room}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish task detail realtime event. type=${type}, workspaceId=${event.data?.workspaceId}, taskId=${event.data?.taskId}, reason=${(error as Error).message}`,
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
