import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceMemberRoleUpdatedEventData } from './workspace-event-payloads';

export class WorkspaceMemberRoleUpdatedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_ROLE_UPDATED,
  WorkspaceMemberRoleUpdatedEventData
> {
  constructor(data: WorkspaceMemberRoleUpdatedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_ROLE_UPDATED, data);
  }
}
