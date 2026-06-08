import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceCreatedEventData } from './workspace-event-payloads';

export class WorkspaceCreatedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_CREATED,
  WorkspaceCreatedEventData
> {
  constructor(data: WorkspaceCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_CREATED, data);
  }
}
