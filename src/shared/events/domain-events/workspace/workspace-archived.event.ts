import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceArchivedEventData } from './workspace-event-payloads';

export class WorkspaceArchivedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_ARCHIVED,
  WorkspaceArchivedEventData
> {
  constructor(data: WorkspaceArchivedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_ARCHIVED, data);
  }
}
