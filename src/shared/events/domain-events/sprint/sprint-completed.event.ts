import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseSprintEvent } from './base-sprint.event';
import { SprintCompletedEventData } from './sprint-event-payloads';

export class SprintCompletedEvent extends BaseSprintEvent<
  typeof DOMAIN_EVENT_TYPES.SPRINT_COMPLETED,
  SprintCompletedEventData
> {
  constructor(data: SprintCompletedEventData) {
    super(DOMAIN_EVENT_TYPES.SPRINT_COMPLETED, data);
  }
}
