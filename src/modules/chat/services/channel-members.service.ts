import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChannelDocument } from '../schemas/channel.schema';
import { ChannelsRepository } from '../repositories/channels.repository';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { UsersService } from '../../users/services/users.service';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { ChannelsService } from './channels.service';

@Injectable()
export class ChannelMembersService {
  constructor(
    private readonly channelsRepository: ChannelsRepository,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly usersService: UsersService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}
  async resolveChannelRole(
    userId: string,
    channel: any,
  ): Promise<'channel_admin' | 'channel_member' | 'not_joined' | null> {
    const user = await this.usersService.getUserById(userId);
    const isSuperAdmin = user?.role === 'super_admin';

    let wsRole: string | null = null;
    if (channel.workspaceId) {
      wsRole = await this.workspaceMemberService.getMemberRole(
        channel.workspaceId.toString(),
        userId,
      );
    }
    const isWsAdmin = wsRole === 'workspace_admin';

    // 1. If it's a custom channel:
    if (channel.type === 'custom') {
      if (!wsRole && !isSuperAdmin) return null;
      if (wsRole === 'viewer') return null;

      const channelMember = channel.channelMembers?.find(
        (m: any) => m.userId.toString() === userId,
      );

      if (!channelMember) {
        // If not in the list:
        // - Public: anyone can join (returns 'not_joined')
        // - Private: only super admin and workspace admin can see/join directly
        const canJoinPrivate = isSuperAdmin || isWsAdmin;
        if (channel.isPrivate && !canJoinPrivate) {
          return null;
        }
        return 'not_joined';
      }

      if (channelMember.joined === false) {
        return 'not_joined';
      }

      // If joined, they have a role. Super admin and ws admin are channel admins.
      if (isSuperAdmin || isWsAdmin) {
        return 'channel_admin';
      }
      return channelMember.role;
    }

    // 2. For non-custom channels:
    if (isSuperAdmin || isWsAdmin) {
      return 'channel_admin';
    }

    if (wsRole === 'viewer') {
      return null;
    }

    if (channel.type === 'general' || channel.type === 'announcement') {
      return 'channel_member';
    }

    if (channel.type === 'dm') {
      const isMember = channel.members.some(
        (m: any) => m.toString() === userId,
      );
      return isMember ? 'channel_member' : null;
    }

    if (channel.type === 'workspace') {
      return wsRole ? 'channel_member' : null;
    }

    return null;
  }

  async joinChannel(
    channelId: string,
    userId: string,
  ): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.channelsService.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only join custom channels');
    }

    if (channel.isPrivate) {
      if (!channel.workspaceId) {
        throw new ForbiddenException('Channel does not belong to a workspace');
      }
      const wsRole = await this.workspaceMemberService.getMemberRole(
        channel.workspaceId.toString(),
        userId,
      );
      const user = await this.usersService.getUserById(userId);
      const isSuperAdmin = user?.role === 'super_admin';
      const isAdmin = isSuperAdmin || wsRole === 'workspace_admin';

      if (!isAdmin) {
        throw new ForbiddenException(
          'Cannot join a private channel directly. You must be invited',
        );
      }
    }

    if (!channel.workspaceId) {
      throw new ForbiddenException('Channel does not belong to a workspace');
    }
    const workspaceIdStr = channel.workspaceId.toString();

    const wsRole = await this.workspaceMemberService.getMemberRole(
      workspaceIdStr,
      userId,
    );
    if (!wsRole || wsRole === 'viewer') {
      throw new ForbiddenException(
        'You do not have permission to join this channel',
      );
    }

    const isAlreadyMember = channel.channelMembers?.some(
      m => m.userId.toString() === userId,
    );
    const memberIndex = channel.channelMembers?.findIndex(
      m => m.userId.toString() === userId,
    );
    if (memberIndex !== -1) {
      const member = channel.channelMembers[memberIndex];
      if (member.joined === false) {
        const updated = await this.channelsRepository.model
          .findOneAndUpdate(
            { _id: new Types.ObjectId(channelId), 'channelMembers.userId': new Types.ObjectId(userId) },
            { $set: { 'channelMembers.$.joined': true } },
            { new: true },
          )
          .exec();
        
        if (!updated) {
          throw new NotFoundException('Channel not found');
        }

        const envelope = {
          eventId: new Types.ObjectId().toString(),
          type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_MEMBER_ADDED,
          data: {
            channelId,
            userId,
            role: member.role || 'channel_member',
            joinedAt: new Date(),
          },
          occurredAt: new Date().toISOString(),
        };
        this.realtimePublisher.emit(
          RoomBuilder.channel(channelId),
          envelope,
          'chat',
        );

        return updated;
      }
      return channel;
    }
    const updated = await this.channelsRepository.model
      .findByIdAndUpdate(
        channelId,
        {
          $push: {
            channelMembers: {
              userId: new Types.ObjectId(userId),
              role: 'channel_member',
              joinedAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Channel not found');
    }

    const envelope = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_MEMBER_ADDED,
      data: {
        channelId,
        userId,
        role: 'channel_member',
        joinedAt: new Date(),
      },
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      envelope,
      'chat',
    );
    this.realtimePublisher.emit(
      RoomBuilder.workspace(workspaceIdStr),
      envelope,
      'chat',
    );

    return updated;
  }

  async leaveChannel(
    channelId: string,
    userId: string,
  ): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.channelsService.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (!channel.workspaceId) {
      throw new BadRequestException('Channel does not belong to a workspace');
    }
    const workspaceIdStr = channel.workspaceId.toString();

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only leave custom channels');
    }

    const member = channel.channelMembers?.find(
      m => m.userId.toString() === userId,
    );
    if (!member) {
      throw new BadRequestException('You are not a member of this channel');
    }

    if (member.role === 'channel_admin') {
      const otherAdmins = channel.channelMembers.filter(
        m => m.userId.toString() !== userId && m.role === 'channel_admin',
      );
      if (otherAdmins.length === 0) {
        const otherMembers = channel.channelMembers.filter(
          m => m.userId.toString() !== userId,
        );
        if (otherMembers.length > 0) {
          throw new BadRequestException(
            'You are the last channel admin. Promote another member to admin before leaving',
          );
        }
      }
    }

    const updated = await this.channelsRepository.model
      .findByIdAndUpdate(
        channelId,
        {
          $pull: {
            channelMembers: { userId: new Types.ObjectId(userId) },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Channel not found');
    }

    const envelope = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_MEMBER_REMOVED,
      data: {
        channelId,
        userId,
      },
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      envelope,
      'chat',
    );
    this.realtimePublisher.emit(
      RoomBuilder.workspace(workspaceIdStr),
      envelope,
      'chat',
    );

    return updated;
  }

  async inviteMembers(
    channelId: string,
    userIds: string[],
    requesterId: string,
  ): Promise<ChannelDocument> {
    if (
      !Types.ObjectId.isValid(channelId) ||
      !Types.ObjectId.isValid(requesterId)
    ) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.channelsService.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only invite to custom channels');
    }

    const role = await this.resolveChannelRole(requesterId, channel);
    if (role !== 'channel_admin') {
      throw new ForbiddenException('Only channel admins can invite members');
    }

    const validUserIds = userIds.filter(id => Types.ObjectId.isValid(id));
    if (validUserIds.length === 0) {
      throw new BadRequestException('No valid user IDs provided');
    }

    if (!channel.workspaceId) {
      throw new BadRequestException('Channel does not belong to a workspace');
    }
    const workspaceIdStr = channel.workspaceId.toString();
    const workspaceMembersSet =
      await this.workspaceMemberService.getMemberIdsSet(workspaceIdStr);

    const membersToAdd: any[] = [];
    const addedMembersDetail: any[] = [];

    for (const uId of validUserIds) {
      if (!workspaceMembersSet.has(uId)) {
        continue;
      }

      const isAlreadyMember = channel.channelMembers?.some(
        m => m.userId.toString() === uId,
      );
      if (isAlreadyMember) {
        continue;
      }
      const joinedAt = new Date();
      membersToAdd.push({
        userId: new Types.ObjectId(uId),
        role: 'channel_member',
        joinedAt,
        invitedBy: new Types.ObjectId(requesterId),
        joined: false,
      });
      addedMembersDetail.push({
        userId: uId,
        role: 'channel_member',
        joinedAt,
      });
    }

    if (membersToAdd.length === 0) {
      return channel;
    }

    const updated = await this.channelsRepository.model
      .findByIdAndUpdate(
        channelId,
        {
          $push: {
            channelMembers: { $each: membersToAdd },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Channel not found');
    }

    for (const item of addedMembersDetail) {
      const envelope = {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_MEMBER_ADDED,
        data: {
          channelId,
          userId: item.userId,
          role: item.role,
          joinedAt: item.joinedAt,
          invitedBy: requesterId,
        },
        occurredAt: new Date().toISOString(),
      };
      this.realtimePublisher.emit(
        RoomBuilder.channel(channelId),
        envelope,
        'chat',
      );
      this.realtimePublisher.emit(
        RoomBuilder.user(item.userId),
        envelope,
        'chat',
      );
    }

    return updated;
  }

  async kickMember(
    channelId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<ChannelDocument> {
    if (
      !Types.ObjectId.isValid(channelId) ||
      !Types.ObjectId.isValid(targetUserId) ||
      !Types.ObjectId.isValid(requesterId)
    ) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.channelsService.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only kick from custom channels');
    }

    const role = await this.resolveChannelRole(requesterId, channel);
    if (role !== 'channel_admin') {
      throw new ForbiddenException('Only channel admins can kick members');
    }

    const member = channel.channelMembers?.find(
      m => m.userId.toString() === targetUserId,
    );
    if (!member) {
      throw new BadRequestException('User is not a member of this channel');
    }

    if (targetUserId === requesterId) {
      throw new BadRequestException('Use leave endpoint to leave the channel');
    }

    const updated = await this.channelsRepository.model
      .findByIdAndUpdate(
        channelId,
        {
          $pull: {
            channelMembers: { userId: new Types.ObjectId(targetUserId) },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Channel not found');
    }

    const envelopeRemoved = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_MEMBER_REMOVED,
      data: {
        channelId,
        userId: targetUserId,
      },
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      envelopeRemoved,
      'chat',
    );

    const envelopeKicked = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_KICKED_FROM_CHANNEL,
      data: {
        channelId,
      },
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.user(targetUserId),
      envelopeKicked,
      'chat',
    );

    return updated;
  }

  async updateMemberRole(
    channelId: string,
    targetUserId: string,
    newRole: 'channel_admin' | 'channel_member',
    requesterId: string,
  ): Promise<ChannelDocument> {
    if (
      !Types.ObjectId.isValid(channelId) ||
      !Types.ObjectId.isValid(targetUserId) ||
      !Types.ObjectId.isValid(requesterId)
    ) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.channelsService.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only update roles in custom channels');
    }

    const requesterRole = await this.resolveChannelRole(requesterId, channel);
    if (requesterRole !== 'channel_admin') {
      throw new ForbiddenException('Only channel admins can change roles');
    }

    const isMember = channel.channelMembers?.some(
      m => m.userId.toString() === targetUserId,
    );
    if (!isMember) {
      throw new BadRequestException('User is not a member of this channel');
    }

    const updated = await this.channelsRepository.model
      .findOneAndUpdate(
        {
          _id: channelId,
          'channelMembers.userId': new Types.ObjectId(targetUserId),
        },
        { $set: { 'channelMembers.$.role': newRole } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Channel not found');
    }

    const envelope = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_UPDATED,
      data: updated,
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      envelope,
      'chat',
    );

    return updated;
  }
}
