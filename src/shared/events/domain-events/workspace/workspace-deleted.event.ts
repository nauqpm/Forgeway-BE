import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceDeletedEventData } from './workspace-event-payloads';

export class WorkspaceDeletedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_DELETED,
  WorkspaceDeletedEventData
> {
  constructor(data: WorkspaceDeletedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_DELETED, data);
  }
}
