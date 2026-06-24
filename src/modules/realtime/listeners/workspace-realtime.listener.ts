import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  DOMAIN_EVENT_TYPES,
  DomainEventType,
} from '../../../shared/events/domain-events';
import {
  BaseWorkspaceEvent,
  WorkspaceArchivedEventData,
  WorkspaceCreatedEventData,
  WorkspaceDeletedEventData,
  WorkspaceEventContext,
  WorkspaceInviteCreatedEventData,
  WorkspaceMemberJoinedEventData,
  WorkspaceMemberRemovedEventData,
  WorkspaceMemberRoleUpdatedEventData,
  WorkspaceRestoredEventData,
  WorkspaceUpdatedEventData,
} from '../../../shared/events/domain-events/workspace';
import {
  REALTIME_EVENT_TYPES,
  RealtimeEnvelope,
  RealtimeEventType,
  RoomBuilder,
} from '../contracts';
import { RealtimePublisher } from '../publishers/realtime.publisher';

export type WorkspaceRealtimeEventData =
  | WorkspaceCreatedEventData
  | WorkspaceInviteCreatedEventData
  | WorkspaceUpdatedEventData
  | WorkspaceArchivedEventData
  | WorkspaceRestoredEventData
  | WorkspaceDeletedEventData
  | WorkspaceMemberJoinedEventData
  | WorkspaceMemberRemovedEventData
  | WorkspaceMemberRoleUpdatedEventData;

export type WorkspaceRealtimeDomainEvent = BaseWorkspaceEvent<
  DomainEventType,
  WorkspaceRealtimeEventData
>;

@Injectable()
export class WorkspaceRealtimeListener {
  private readonly logger = new Logger(WorkspaceRealtimeListener.name);

  constructor(private readonly realtimePublisher: RealtimePublisher) {}

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_INVITE_CREATED, { async: true })
  handleWorkspaceInviteCreated(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceInviteEvent(
      REALTIME_EVENT_TYPES.WORKSPACE_INVITE_CREATED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_CREATED, { async: true })
  handleWorkspaceCreated(event: WorkspaceRealtimeDomainEvent): void {
    const actorId = event.data.actorId;
    if (actorId) {
      // Emit strictly to the creator, because they are not yet in the workspace room
      this.publishToRoom(
        REALTIME_EVENT_TYPES.WORKSPACE_CREATED,
        event,
        RoomBuilder.user(actorId),
      );
    }
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_UPDATED, { async: true })
  handleWorkspaceUpdated(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceEvent(REALTIME_EVENT_TYPES.WORKSPACE_UPDATED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_ARCHIVED, { async: true })
  handleWorkspaceArchived(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceEvent(REALTIME_EVENT_TYPES.WORKSPACE_ARCHIVED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_RESTORED, { async: true })
  handleWorkspaceRestored(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceEvent(REALTIME_EVENT_TYPES.WORKSPACE_RESTORED, event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_DELETED, { async: true })
  handleWorkspaceDeleted(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceEvent(REALTIME_EVENT_TYPES.WORKSPACE_DELETED, event);
    // Also emit to the actor's personal room so /workspaces page updates in realtime
    const actorId = event.data.actorId;
    if (actorId) {
      this.publishToRoom(
        REALTIME_EVENT_TYPES.WORKSPACE_DELETED,
        event,
        RoomBuilder.user(actorId),
      );
    }
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_JOINED, { async: true })
  handleWorkspaceMemberJoined(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceEvent(
      REALTIME_EVENT_TYPES.WORKSPACE_MEMBER_JOINED,
      event,
    );

    const userId = (event.data as WorkspaceMemberJoinedEventData).userId;
    if (userId) {
      this.publishToRoom(
        REALTIME_EVENT_TYPES.WORKSPACE_MEMBER_JOINED,
        event,
        RoomBuilder.user(userId),
      );
    }
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_REMOVED, { async: true })
  handleWorkspaceMemberRemoved(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceMemberEvent(
      REALTIME_EVENT_TYPES.WORKSPACE_MEMBER_REMOVED,
      event,
    );
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_ROLE_UPDATED, { async: true })
  handleWorkspaceMemberRoleUpdated(event: WorkspaceRealtimeDomainEvent): void {
    this.publishWorkspaceEvent(
      REALTIME_EVENT_TYPES.WORKSPACE_MEMBER_ROLE_UPDATED,
      event,
    );
  }

  private publishWorkspaceInviteEvent(
    type: RealtimeEventType,
    event: WorkspaceRealtimeDomainEvent,
  ): void {
    const recipientId = (event.data as WorkspaceInviteCreatedEventData)
      .recipientId;

    if (!recipientId) {
      this.logger.debug(
        `Skipping realtime workspace invite event without recipientId. workspaceId=${event.data.workspaceId}, recipientEmail=${(event.data as WorkspaceInviteCreatedEventData).recipientEmail}`,
      );
      return;
    }

    this.publishToRoom(type, event, RoomBuilder.user(recipientId));
  }

  private publishWorkspaceEvent(
    type: RealtimeEventType,
    event: WorkspaceRealtimeDomainEvent,
  ): void {
    this.publishToRoom(
      type,
      event,
      RoomBuilder.workspace(event.data.workspaceId),
    );
  }

  private publishWorkspaceMemberEvent(
    type: RealtimeEventType,
    event: WorkspaceRealtimeDomainEvent,
  ): void {
    const userId = (event.data as WorkspaceMemberRemovedEventData).userId;

    if (!userId) {
      this.publishWorkspaceEvent(type, event);
      return;
    }

    this.publishToRoom(type, event, RoomBuilder.user(userId));
  }

  private publishToRoom(
    type: RealtimeEventType,
    event: WorkspaceRealtimeDomainEvent,
    room: string,
  ): void {
    try {
      const envelope = this.buildEnvelope(type, event);

      this.realtimePublisher.emit(room, envelope);
      this.logger.debug(
        `Published realtime workspace event. type=${type}, workspaceId=${event.data.workspaceId}, entityId=${envelope.entityId}, room=${room}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish realtime workspace event. type=${type}, workspaceId=${event.data?.workspaceId}, reason=${(error as Error).message}`,
      );
    }
  }

  private buildEnvelope<TData extends WorkspaceEventContext>(
    type: RealtimeEventType,
    event: BaseWorkspaceEvent<DomainEventType, TData>,
  ): RealtimeEnvelope<TData> {
    return {
      eventId:
        event.eventId ??
        event.data.eventId ??
        `${type}:${event.data.workspaceId}:${event.occurredAt.getTime()}`,
      type,
      correlationId: event.correlationId ?? event.data.correlationId,
      causationId: event.causationId ?? event.data.causationId,
      workspaceId: event.data.workspaceId,
      actorId: event.data.actorId,
      entityId: this.getEntityId(event.data),
      version: event.data.version,
      occurredAt: event.occurredAt.toISOString(),
      data: event.data,
    };
  }

  private getEntityId(data: WorkspaceEventContext): string {
    if ('inviteId' in data && typeof data.inviteId === 'string') {
      return data.inviteId;
    }
    if ('userId' in data && typeof data.userId === 'string') {
      return data.userId;
    }
    return data.workspaceId;
  }
}
