import { randomUUID } from 'crypto';

import { DomainEvent } from '../domain-event.interface';
import { DomainEventType } from '../domain-event-types';
import { ChannelEventContext } from './channel-event-payloads';

export abstract class BaseChannelEvent<
  TType extends DomainEventType,
  TData extends ChannelEventContext,
> implements DomainEvent<TType, TData> {
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly occurredAt: Date;

  protected constructor(
    readonly type: TType,
    readonly data: TData,
  ) {
    this.eventId = data.eventId ?? randomUUID();
    this.correlationId = data.correlationId;
    this.causationId = data.causationId;
    this.occurredAt = data.occurredAt ?? new Date();
  }
}
