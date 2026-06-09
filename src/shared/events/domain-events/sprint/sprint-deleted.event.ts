import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseSprintEvent } from './base-sprint.event';
import { SprintDeletedEventData } from './sprint-event-payloads';

export class SprintDeletedEvent extends BaseSprintEvent<
  typeof DOMAIN_EVENT_TYPES.SPRINT_DELETED,
  SprintDeletedEventData
> {
  constructor(data: SprintDeletedEventData) {
    super(DOMAIN_EVENT_TYPES.SPRINT_DELETED, data);
  }
}
