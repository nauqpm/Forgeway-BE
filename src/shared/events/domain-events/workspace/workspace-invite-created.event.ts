import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceInviteCreatedEventData } from './workspace-event-payloads';

export class WorkspaceInviteCreatedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_INVITE_CREATED,
  WorkspaceInviteCreatedEventData
> {
  constructor(data: WorkspaceInviteCreatedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_INVITE_CREATED, data);
  }
}
