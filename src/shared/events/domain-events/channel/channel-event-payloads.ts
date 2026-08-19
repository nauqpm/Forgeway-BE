import { DomainEventMetadata } from '../domain-event.interface';

export interface ChannelEventContext extends DomainEventMetadata {
  channelId: string;
  workspaceId: string;
  actorId?: string;
}

export interface ChannelMembersInvitedEventData extends ChannelEventContext {
  actorId: string;
  recipientIds: string[];
  channelName: string;
  isPrivate: boolean;
}
