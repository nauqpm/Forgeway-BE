import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceUpdatedEventData } from './workspace-event-payloads';

export class WorkspaceUpdatedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_UPDATED,
  WorkspaceUpdatedEventData
> {
  constructor(data: WorkspaceUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_UPDATED, data);
  }
}
