import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseSprintEvent } from './base-sprint.event';
import { SprintUpdatedEventData } from './sprint-event-payloads';

export class SprintUpdatedEvent extends BaseSprintEvent<
  typeof DOMAIN_EVENT_TYPES.SPRINT_UPDATED,
  SprintUpdatedEventData
> {
  constructor(data: SprintUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.SPRINT_UPDATED, data);
  }
}
