export interface RealtimeEnvelope<TData> {
  eventId: string;
  type: string;
  correlationId?: string;
  causationId?: string;
  workspaceId?: string;
  actorId?: string;
  entityId?: string;
  version?: number;
  occurredAt: string;
  data: TData;
}
