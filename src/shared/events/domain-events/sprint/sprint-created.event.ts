import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseSprintEvent } from './base-sprint.event';
import { SprintCreatedEventData } from './sprint-event-payloads';

export class SprintCreatedEvent extends BaseSprintEvent<
  typeof DOMAIN_EVENT_TYPES.SPRINT_CREATED,
  SprintCreatedEventData
> {
  constructor(data: SprintCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.SPRINT_CREATED, data);
  }
}
