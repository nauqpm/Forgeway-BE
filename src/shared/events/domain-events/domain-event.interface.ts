import { DomainEventType } from './domain-event-types';

export interface DomainEventMetadata {
  eventId?: string;
  correlationId?: string;
  causationId?: string;
  occurredAt?: Date;
}

export interface DomainEvent<TType extends DomainEventType, TData> {
  readonly type: TType;
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly data: TData;
}
