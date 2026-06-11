import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceMemberRemovedEventData } from './workspace-event-payloads';

export class WorkspaceMemberRemovedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_REMOVED,
  WorkspaceMemberRemovedEventData
> {
  constructor(data: WorkspaceMemberRemovedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_REMOVED, data);
  }
}
