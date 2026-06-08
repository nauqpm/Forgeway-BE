import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  WorkspaceArchivedEvent,
  WorkspaceCreatedEvent,
  WorkspaceDeletedEvent,
  WorkspaceRestoredEvent,
  WorkspaceSummaryPayload,
  WorkspaceUpdatedEvent,
} from '../../../shared/events/domain-events/workspace';

@Injectable()
export class WorkspaceDomainEventPublisher {
  private readonly logger = new Logger(WorkspaceDomainEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  publishCreated(workspace: any, actorId?: string): void {
    this.emit(
      new WorkspaceCreatedEvent({
        workspaceId: this.toId(workspace._id ?? workspace.id),
        actorId,
        version: this.toVersion(workspace.version ?? workspace.__v),
        workspace: this.toWorkspaceSummary(workspace),
      }),
    );
  }

  publishUpdated(workspace: any, actorId?: string): void {
    this.emit(
      new WorkspaceUpdatedEvent({
        workspaceId: this.toId(workspace._id ?? workspace.id),
        actorId,
        version: this.toVersion(workspace.version ?? workspace.__v),
        workspace: this.toWorkspaceSummary(workspace),
      }),
    );
  }

  publishArchived(workspace: any, actorId?: string): void {
    this.emit(
      new WorkspaceArchivedEvent({
        workspaceId: this.toId(workspace._id ?? workspace.id),
        actorId,
        version: this.toVersion(workspace.version ?? workspace.__v),
        workspace: this.toWorkspaceSummary(workspace),
      }),
    );
  }

  publishRestored(workspace: any, actorId?: string): void {
    this.emit(
      new WorkspaceRestoredEvent({
        workspaceId: this.toId(workspace._id ?? workspace.id),
        actorId,
        version: this.toVersion(workspace.version ?? workspace.__v),
        workspace: this.toWorkspaceSummary(workspace),
      }),
    );
  }

  publishDeleted(workspaceId: string, workspace?: any, actorId?: string): void {
    this.emit(
      new WorkspaceDeletedEvent({
        workspaceId,
        actorId,
        version: this.toVersion(workspace?.version ?? workspace?.__v),
        workspace: workspace ? this.toWorkspaceSummary(workspace) : undefined,
      }),
    );
  }

  private emit(event: { type: string }): void {
    try {
      this.eventEmitter.emit(event.type, event);
    } catch (error) {
      this.logger.warn(
        `Failed to publish workspace domain event. type=${event.type}, reason=${(error as Error).message}`,
      );
    }
  }

  private toWorkspaceSummary(workspace: any): WorkspaceSummaryPayload {
    const id = this.toId(workspace._id ?? workspace.id);

    return {
      id,
      key: workspace.key,
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      status: workspace.status,
      access: workspace.access,
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
