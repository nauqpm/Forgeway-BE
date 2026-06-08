import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseSprintEvent } from './base-sprint.event';
import { SprintStartedEventData } from './sprint-event-payloads';

export class SprintStartedEvent extends BaseSprintEvent<
  typeof DOMAIN_EVENT_TYPES.SPRINT_STARTED,
  SprintStartedEventData
> {
  constructor(data: SprintStartedEventData) {
    super(DOMAIN_EVENT_TYPES.SPRINT_STARTED, data);
  }
}
