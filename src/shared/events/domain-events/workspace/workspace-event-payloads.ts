import { DomainEventMetadata } from '../domain-event.interface';

export interface WorkspaceEventContext extends DomainEventMetadata {
  workspaceId: string;
  actorId?: string;
  version?: number;
}

export interface WorkspaceSummaryPayload {
  id: string;
  key: string;
  name: string;
  slug?: string;
  type?: string;
  status?: string;
  access?: string;
}

export interface WorkspaceInviteSummaryPayload {
  id: string;
  workspaceId: string;
  invitedEmail: string | null;
  invitedBy: string;
  role: string;
  status: string;
  expiresAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface WorkspaceMemberSummaryPayload {
  userId: string;
  role: string;
}

export interface WorkspaceInviteCreatedEventData extends WorkspaceEventContext {
  inviteId: string;
  recipientEmail: string;
  recipientId?: string;
  role: string;
  workspace?: WorkspaceSummaryPayload;
  invite?: WorkspaceInviteSummaryPayload;
}

export interface WorkspaceCreatedEventData extends WorkspaceEventContext {
  workspace: WorkspaceSummaryPayload;
}

export interface WorkspaceUpdatedEventData extends WorkspaceEventContext {
  workspace: WorkspaceSummaryPayload;
}

export interface WorkspaceArchivedEventData extends WorkspaceEventContext {
  workspace: WorkspaceSummaryPayload;
}

export interface WorkspaceRestoredEventData extends WorkspaceEventContext {
  workspace: WorkspaceSummaryPayload;
}

export interface WorkspaceDeletedEventData extends WorkspaceEventContext {
  workspace?: WorkspaceSummaryPayload;
}

export interface WorkspaceMemberJoinedEventData extends WorkspaceEventContext {
  userId: string;
  role: string;
  workspace?: WorkspaceSummaryPayload;
  member?: WorkspaceMemberSummaryPayload;
}

export interface WorkspaceMemberRemovedEventData extends WorkspaceEventContext {
  userId: string;
  previousRole?: string;
  workspace?: WorkspaceSummaryPayload;
}

export interface WorkspaceMemberRoleUpdatedEventData extends WorkspaceEventContext {
  userId: string;
  previousRole: string;
  nextRole: string;
  workspace?: WorkspaceSummaryPayload;
  member?: WorkspaceMemberSummaryPayload;
}
