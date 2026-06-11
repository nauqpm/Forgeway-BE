import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceMemberJoinedEventData } from './workspace-event-payloads';

export class WorkspaceMemberJoinedEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_JOINED,
  WorkspaceMemberJoinedEventData
> {
  constructor(data: WorkspaceMemberJoinedEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_JOINED, data);
  }
}
