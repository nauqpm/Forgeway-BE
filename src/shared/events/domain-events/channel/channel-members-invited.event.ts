import { DOMAIN_EVENT_TYPES } from '../domain-event-types';
import { BaseChannelEvent } from './base-channel.event';
import { ChannelMembersInvitedEventData } from './channel-event-payloads';

export class ChannelMembersInvitedEvent extends BaseChannelEvent<
  typeof DOMAIN_EVENT_TYPES.CHANNEL_MEMBERS_INVITED,
  ChannelMembersInvitedEventData
> {
  constructor(data: ChannelMembersInvitedEventData) {
    super(DOMAIN_EVENT_TYPES.CHANNEL_MEMBERS_INVITED, data);
  }
}
