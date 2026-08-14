import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseWorkspaceEvent } from './base-workspace.event';
import { WorkspaceInviteCancelledEventData } from './workspace-event-payloads';

export class WorkspaceInviteCancelledEvent extends BaseWorkspaceEvent<
  typeof DOMAIN_EVENT_TYPES.WORKSPACE_INVITE_CANCELLED,
  WorkspaceInviteCancelledEventData
> {
  constructor(data: WorkspaceInviteCancelledEventData) {
    super(DOMAIN_EVENT_TYPES.WORKSPACE_INVITE_CANCELLED, data);
  }
}
