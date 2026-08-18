import { Types } from 'mongoose';
import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { ChannelMembersService } from './channel-members.service';

describe('ChannelMembersService', () => {
  it('activates invited members, notifies them, and emits to their user room', async () => {
    const channelId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const requesterId = new Types.ObjectId().toString();
    const invitedUserId = new Types.ObjectId().toString();
    const channel = {
      _id: new Types.ObjectId(channelId),
      name: 'private-planning',
      type: 'custom',
      isPrivate: true,
      workspaceId: new Types.ObjectId(workspaceId),
      channelMembers: [
        {
          userId: new Types.ObjectId(requesterId),
          role: 'channel_admin',
          joined: true,
        },
      ],
    };
    const updated = { ...channel };
    const channelsRepository = {
      addMembersIfAbsent: jest.fn().mockResolvedValue({
        channel: updated,
        addedUserIds: [invitedUserId],
      }),
    };
    const channelsService = {
      findById: jest.fn().mockResolvedValue(channel),
    };
    const workspaceMemberService = {
      getMemberRole: jest.fn().mockResolvedValue('workspace_admin'),
      getMemberIdsSet: jest
        .fn()
        .mockResolvedValue(new Set([requesterId, invitedUserId])),
    };
    const usersService = {
      getUserById: jest.fn().mockResolvedValue({ role: 'user' }),
    };
    const realtimePublisher = { emit: jest.fn() };
    const eventEmitter = { emit: jest.fn() };
    const service = new ChannelMembersService(
      channelsRepository as never,
      channelsService as never,
      workspaceMemberService as never,
      usersService as never,
      realtimePublisher as never,
      eventEmitter as never,
    );

    await expect(
      service.inviteMembers(channelId, [invitedUserId], requesterId),
    ).resolves.toBe(updated);

    expect(channelsRepository.addMembersIfAbsent).toHaveBeenCalledWith(
      channelId,
      [
        expect.objectContaining({
          userId: new Types.ObjectId(invitedUserId),
          role: 'channel_member',
          invitedBy: new Types.ObjectId(requesterId),
          joined: true,
        }),
      ],
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      DOMAIN_EVENT_TYPES.CHANNEL_MEMBERS_INVITED,
      expect.objectContaining({
        data: {
          recipientIds: [invitedUserId],
          actorId: requesterId,
          workspaceId,
          channelId,
          channelName: 'private-planning',
          isPrivate: true,
        },
      }),
    );
    expect(realtimePublisher.emit).toHaveBeenCalledWith(
      RoomBuilder.user(invitedUserId),
      expect.objectContaining({
        data: expect.objectContaining({
          channelId,
          userId: invitedUserId,
        }),
      }),
      'chat',
    );
  });

  it('does not emit side effects when a concurrent invite already added the member', async () => {
    const channelId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const requesterId = new Types.ObjectId().toString();
    const invitedUserId = new Types.ObjectId().toString();
    const channel = {
      _id: new Types.ObjectId(channelId),
      name: 'planning',
      type: 'custom',
      isPrivate: false,
      workspaceId: new Types.ObjectId(workspaceId),
      channelMembers: [
        {
          userId: new Types.ObjectId(requesterId),
          role: 'channel_admin',
          joined: true,
        },
      ],
    };
    const channelsRepository = {
      addMembersIfAbsent: jest.fn().mockResolvedValue({
        channel,
        addedUserIds: [],
      }),
    };
    const realtimePublisher = { emit: jest.fn() };
    const eventEmitter = { emit: jest.fn() };
    const service = new ChannelMembersService(
      channelsRepository as never,
      { findById: jest.fn().mockResolvedValue(channel) } as never,
      {
        getMemberRole: jest.fn().mockResolvedValue('workspace_admin'),
        getMemberIdsSet: jest
          .fn()
          .mockResolvedValue(new Set([requesterId, invitedUserId])),
      } as never,
      { getUserById: jest.fn().mockResolvedValue({ role: 'user' }) } as never,
      realtimePublisher as never,
      eventEmitter as never,
    );

    await expect(
      service.inviteMembers(channelId, [invitedUserId], requesterId),
    ).resolves.toBe(channel);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(realtimePublisher.emit).not.toHaveBeenCalled();
  });
});
