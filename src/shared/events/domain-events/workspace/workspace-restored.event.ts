import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceRestoredEventData } from './workspace-event-payloads';

export class WorkspaceRestoredEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_RESTORED,
  WorkspaceRestoredEventData
> {
  constructor(data: WorkspaceRestoredEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_RESTORED, data);
  }
}
