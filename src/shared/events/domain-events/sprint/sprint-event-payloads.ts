import { DomainEventMetadata } from '../domain-event.interface';

export interface SprintSummaryPayload {
  id: string;
  _id: string;
  workspaceId: string;
  name: string;
  status: string;
  goal?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  duration?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface SprintEventContext extends DomainEventMetadata {
  workspaceId: string;
  sprintId: string;
  actorId?: string;
  version?: number;
}

export interface SprintCreatedEventData extends SprintEventContext {
  sprint: SprintSummaryPayload;
}

export interface SprintUpdatedEventData extends SprintEventContext {
  sprint: SprintSummaryPayload;
}

export interface SprintDeletedEventData extends SprintEventContext {
  sprint?: SprintSummaryPayload;
}

export interface SprintStartedEventData extends SprintEventContext {
  sprint: SprintSummaryPayload;
}

export interface SprintCompletedEventData extends SprintEventContext {
  sprint: SprintSummaryPayload;
  incompleteTasksMovedTo?: string | null;
}
