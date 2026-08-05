import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events/domain-event-types';
import {
  SprintCompletedEvent,
  SprintStartedEvent,
} from '../../../shared/events/domain-events/sprint';
import { SprintNotificationService } from '../services/sprint-notification.service';

@Injectable()
export class SprintNotificationListener {
  constructor(
    private readonly sprintNotificationService: SprintNotificationService,
  ) {}

  @OnEvent(DOMAIN_EVENT_TYPES.SPRINT_STARTED, { async: true })
  async handleSprintStarted(event: SprintStartedEvent): Promise<void> {
    await this.sprintNotificationService.handleSprintStarted(event);
  }

  @OnEvent(DOMAIN_EVENT_TYPES.SPRINT_COMPLETED, { async: true })
  async handleSprintCompleted(event: SprintCompletedEvent): Promise<void> {
    await this.sprintNotificationService.handleSprintCompleted(event);
  }
}
