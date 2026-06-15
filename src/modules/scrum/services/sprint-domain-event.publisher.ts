import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  SprintCompletedEvent,
  SprintCreatedEvent,
  SprintDeletedEvent,
  SprintStartedEvent,
  SprintSummaryPayload,
  SprintUpdatedEvent,
} from '../../../shared/events/domain-events/sprint';
import { SprintDocument } from '../schemas/sprint.schema';

@Injectable()
export class SprintDomainEventPublisher {
  private readonly logger = new Logger(SprintDomainEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  publishCreated(sprint: SprintDocument | any, actorId?: string): void {
    this.emit(
      new SprintCreatedEvent({
        workspaceId: this.toId(sprint.workspaceId),
        sprintId: this.toId(sprint._id ?? sprint.id),
        actorId,
        version: this.toVersion(sprint.version ?? sprint.__v),
        sprint: this.toSprintSummary(sprint),
      }),
    );
  }

  publishUpdated(sprint: SprintDocument | any, actorId?: string): void {
    this.emit(
      new SprintUpdatedEvent({
        workspaceId: this.toId(sprint.workspaceId),
        sprintId: this.toId(sprint._id ?? sprint.id),
        actorId,
        version: this.toVersion(sprint.version ?? sprint.__v),
        sprint: this.toSprintSummary(sprint),
      }),
    );
  }

  publishDeleted(sprint: SprintDocument | any, actorId?: string): void {
    this.emit(
      new SprintDeletedEvent({
        workspaceId: this.toId(sprint.workspaceId),
        sprintId: this.toId(sprint._id ?? sprint.id),
        actorId,
        version: this.toVersion(sprint.version ?? sprint.__v),
        sprint: this.toSprintSummary(sprint),
      }),
    );
  }

  publishStarted(sprint: SprintDocument | any, actorId?: string): void {
    this.emit(
      new SprintStartedEvent({
        workspaceId: this.toId(sprint.workspaceId),
        sprintId: this.toId(sprint._id ?? sprint.id),
        actorId,
        version: this.toVersion(sprint.version ?? sprint.__v),
        sprint: this.toSprintSummary(sprint),
      }),
    );
  }

  publishCompleted(
    sprint: SprintDocument | any,
    actorId?: string,
    incompleteTasksMovedTo?: string | null,
  ): void {
    this.emit(
      new SprintCompletedEvent({
        workspaceId: this.toId(sprint.workspaceId),
        sprintId: this.toId(sprint._id ?? sprint.id),
        actorId,
        version: this.toVersion(sprint.version ?? sprint.__v),
        sprint: this.toSprintSummary(sprint),
        incompleteTasksMovedTo: incompleteTasksMovedTo ?? null,
      }),
    );
  }

  private emit(event: { type: string }): void {
    try {
      this.eventEmitter.emit(event.type, event);
    } catch (error) {
      this.logger.warn(
        `Failed to publish sprint domain event. type=${event.type}, reason=${(error as Error).message}`,
      );
    }
  }

  private toSprintSummary(sprint: SprintDocument | any): SprintSummaryPayload {
    const id = this.toId(sprint._id ?? sprint.id);
    const workspaceId = this.toId(sprint.workspaceId);

    return {
      id,
      _id: id,
      workspaceId,
      name: sprint.name,
      status: sprint.status,
      goal: sprint.goal ?? null,
      startDate: sprint.startDate ?? null,
      endDate: sprint.endDate ?? null,
      duration: sprint.duration ?? null,
      createdAt: sprint.createdAt,
      updatedAt: sprint.updatedAt,
    };
  }

  private toVersion(value: unknown): number {
    const version = Number(value);
    return Number.isFinite(version) && version >= 0 ? version : 0;
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }
}
