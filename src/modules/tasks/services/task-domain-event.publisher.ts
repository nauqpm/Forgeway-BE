import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  TaskArchivedEvent,
  TaskChangeValue,
  TaskCreatedEvent,
  TaskDeletedEvent,
  TaskFieldChange,
  TaskMovedEvent,
  TaskReorderedEvent,
  TaskRestoredEvent,
  TaskSummaryPayload,
  TaskUpdatedEvent,
} from '../../../shared/events/domain-events/task';
import { TaskDocument } from '../schemas/task.schema';

interface ReorderNeighbors {
  beforeTaskId?: string | null;
  afterTaskId?: string | null;
}

@Injectable()
export class TaskDomainEventPublisher {
  private readonly logger = new Logger(TaskDomainEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  publishCreated(task: TaskDocument | any, actorId: string): void {
    const context = this.getTaskContext(task, actorId);
    this.emit(
      new TaskCreatedEvent({
        ...context,
        task: this.toTaskSummary(task),
      }),
    );
  }

  publishUpdated(
    previousTask: TaskDocument | any,
    updatedTask: TaskDocument | any,
    actorId: string,
  ): void {
    const changes = this.buildFieldChanges(previousTask, updatedTask);
    if (changes.length === 0) {
      return;
    }

    const context = this.getTaskContext(updatedTask, actorId);
    this.emit(
      new TaskUpdatedEvent({
        ...context,
        task: this.toTaskSummary(updatedTask),
        changes,
      }),
    );
  }

  publishMoved(
    previousTask: TaskDocument | any,
    movedTask: TaskDocument | any,
    actorId: string,
  ): void {
    const context = this.getTaskContext(movedTask, actorId);
    this.emit(
      new TaskMovedEvent({
        ...context,
        task: this.toTaskSummary(movedTask),
        fromColumnId: this.toOptionalString(previousTask.columnId) ?? null,
        toColumnId: this.toOptionalString(movedTask.columnId) ?? null,
        fromStatus: this.toOptionalString(previousTask.status) ?? null,
        toStatus: this.toOptionalString(movedTask.status) ?? null,
        fromSprintId: this.toOptionalId(previousTask.sprintId) ?? null,
        toSprintId: this.toOptionalId(movedTask.sprintId) ?? null,
        fromRank: this.toOptionalString(previousTask.rank) ?? null,
        toRank: this.toOptionalString(movedTask.rank) ?? null,
      }),
    );
  }

  publishReordered(
    previousTask: TaskDocument | any,
    reorderedTask: TaskDocument | any,
    actorId: string,
    neighbors: ReorderNeighbors,
  ): void {
    const context = this.getTaskContext(reorderedTask, actorId);
    this.emit(
      new TaskReorderedEvent({
        ...context,
        task: this.toTaskSummary(reorderedTask),
        fromColumnId: this.toOptionalString(previousTask.columnId) ?? null,
        toColumnId: this.toOptionalString(reorderedTask.columnId) ?? null,
        fromStatus: this.toOptionalString(previousTask.status) ?? null,
        toStatus: this.toOptionalString(reorderedTask.status) ?? null,
        fromSprintId: this.toOptionalId(previousTask.sprintId) ?? null,
        toSprintId: this.toOptionalId(reorderedTask.sprintId) ?? null,
        fromRank: this.toOptionalString(previousTask.rank) ?? null,
        toRank: this.toOptionalString(reorderedTask.rank) ?? null,
        beforeTaskId: neighbors.beforeTaskId ?? null,
        afterTaskId: neighbors.afterTaskId ?? null,
      }),
    );
  }

  publishArchived(task: TaskDocument | any, actorId: string): void {
    const context = this.getTaskContext(task, actorId);
    this.emit(
      new TaskArchivedEvent({
        ...context,
        task: this.toTaskSummary(task),
        archivedBy: actorId,
        archivedAt: task.archivedAt ?? new Date(),
      }),
    );
  }

  publishRestored(task: TaskDocument | any, actorId: string): void {
    const context = this.getTaskContext(task, actorId);
    this.emit(
      new TaskRestoredEvent({
        ...context,
        task: this.toTaskSummary(task),
        restoredBy: actorId,
      }),
    );
  }

  publishDeleted(task: TaskDocument | any, actorId: string): void {
    const context = this.getTaskContext(task, actorId);
    this.emit(
      new TaskDeletedEvent({
        ...context,
        task: this.toTaskSummary(task),
        deletedBy: actorId,
        deletedAt: task.deletedAt ?? new Date(),
      }),
    );
  }

  private emit(event: { type: string }): void {
    try {
      this.eventEmitter.emit(event.type, event);
    } catch (error) {
      this.logger.warn(
        `Failed to publish task domain event. type=${event.type}, reason=${(error as Error).message}`,
      );
    }
  }

  private getTaskContext(task: TaskDocument | any, actorId: string) {
    return {
      workspaceId: this.toId(task.workspaceId),
      taskId: this.toId(task._id ?? task.id),
      taskKey: task.key,
      actorId,
      version: this.toVersion(task.version),
    };
  }

  private toTaskSummary(task: TaskDocument | any): TaskSummaryPayload {
    return {
      id: this.toId(task._id ?? task.id),
      key: task.key,
      title: task.title,
      type: task.type,
      priority: task.priority,
      status: task.status,
      columnId: task.columnId,
      sprintId: this.toOptionalId(task.sprintId) ?? null,
      rank: task.rank,
      version: this.toVersion(task.version),
      assigneeId: this.toOptionalId(task.assigneeId) ?? null,
      reporterId: this.toOptionalId(task.reporterId),
      isArchived: Boolean(task.isArchived),
      isDeleted: Boolean(task.isDeleted),
      updatedAt: task.updatedAt,
    };
  }

  private buildFieldChanges(
    previousTask: TaskDocument | any,
    updatedTask: TaskDocument | any,
  ): TaskFieldChange[] {
    const fields = [
      'title',
      'description',
      'type',
      'priority',
      'assigneeId',
      'storyPoints',
      'startDate',
      'dueDate',
      'epicId',
      'boardId',
    ];

    return fields.reduce<TaskFieldChange[]>((changes, field) => {
      const from = this.valueForField(previousTask, field);
      const to = this.valueForField(updatedTask, field);

      if (from !== to) {
        changes.push({ field, from, to });
      }

      return changes;
    }, []);
  }

  private valueForField(
    task: TaskDocument | any,
    field: string,
  ): TaskChangeValue {
    const value = task?.[field];

    if (field.endsWith('Id')) {
      return this.toOptionalId(value) ?? null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value && typeof value === 'object' && '_id' in value) {
      return this.toOptionalId(value) ?? null;
    }

    return value ?? null;
  }

  private toVersion(value: unknown): number {
    const version = Number(value);
    return Number.isFinite(version) && version > 0 ? version : 1;
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  private toOptionalId(value: any): string | undefined {
    if (!value) {
      return undefined;
    }

    return this.toId(value);
  }

  private toOptionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return String(value);
  }
}
