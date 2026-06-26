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
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { UsersService } from '../../users/services/users.service';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { ChannelsService } from './channels.service';
import { ChannelMembersService } from './channel-members.service';

@Injectable()
export class CustomChannelsService {
  constructor(
    private readonly channelsRepository: ChannelsRepository,
    @Inject(forwardRef(() => WorkspacesService))
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly realtimePublisher: RealtimePublisher,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    @Inject(forwardRef(() => ChannelMembersService))
    private readonly channelMembersService: ChannelMembersService,
  ) {}

  async createCustomChannel(
    workspaceId: string,
    createdBy: string,
    dto: { name: string; isPrivate?: boolean; description?: string },
  ): Promise<ChannelDocument> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(createdBy)
    ) {
      throw new BadRequestException('Invalid IDs');
    }

    const workspace = await this.workspacesService.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const customChannelCount =
      await this.channelsRepository.model.countDocuments({
        workspaceId: new Types.ObjectId(workspaceId),
        type: 'custom',
      });
    if (customChannelCount >= 20) {
      throw new BadRequestException(
        'Maximum limit of 20 custom channels reached for this workspace',
      );
    }

    const wsRole = await this.workspaceMemberService.getMemberRole(
      workspaceId,
      createdBy,
    );
    const user = await this.usersService.getUserById(createdBy);
    const isSuperAdmin = user?.role === 'super_admin';

    if (!wsRole && !isSuperAdmin) {
      throw new ForbiddenException('You do not belong to this workspace');
    }
    if (wsRole === 'viewer') {
      throw new ForbiddenException('Viewers cannot create custom channels');
    }

    const channelMembers: any[] = [
      {
        userId: new Types.ObjectId(createdBy),
        role: 'channel_admin',
        joinedAt: new Date(),
      },
    ];

    const wsMembers = await this.workspaceMemberService.getMembers(workspaceId);
    for (const member of wsMembers) {
      const memberUserIdStr = member.userId?.toString() || '';
      if (
        member.role === 'workspace_admin' &&
        memberUserIdStr !== createdBy &&
        Types.ObjectId.isValid(memberUserIdStr)
      ) {
        channelMembers.push({
          userId: new Types.ObjectId(memberUserIdStr),
          role: 'channel_admin',
          joinedAt: new Date(),
        });
      }
    }

    const channel = await this.channelsRepository.model.create({
      name: dto.name,
      type: 'custom',
      description: dto.description || '',
      workspaceId: new Types.ObjectId(workspaceId),
      isPrivate: !!dto.isPrivate,
      createdBy: new Types.ObjectId(createdBy),
      channelMembers,
    });

    const envelope = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_CREATED,
      data: channel,
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.workspace(workspaceId),
      envelope,
      'chat',
    );

    return channel;
  }

  async findWorkspaceCustomChannels(
    workspaceId: string,
    userId: string,
  ): Promise<ChannelDocument[]> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return [];
    }

    const wsRole = await this.workspaceMemberService.getMemberRole(
      workspaceId,
      userId,
    );
    const user = await this.usersService.getUserById(userId);
    const isSuperAdmin = user?.role === 'super_admin';
    const isAdmin = isSuperAdmin || wsRole === 'workspace_admin';

    let query: any;
    if (isAdmin) {
      query = {
        workspaceId: new Types.ObjectId(workspaceId),
        type: 'custom',
      };
    } else {
      query = {
        workspaceId: new Types.ObjectId(workspaceId),
        type: 'custom',
        $or: [
          { isPrivate: false },
          {
            isPrivate: true,
            'channelMembers.userId': new Types.ObjectId(userId),
          },
        ],
      };
    }

    return this.channelsRepository.model.find(query).exec();
  }

  async updateCustomChannel(
    channelId: string,
    dto: { name?: string; description?: string; isPrivate?: boolean },
    requesterId: string,
  ): Promise<ChannelDocument> {
    if (
      !Types.ObjectId.isValid(channelId) ||
      !Types.ObjectId.isValid(requesterId)
    ) {
      throw new BadRequestException('Invalid IDs');
    }

    let channel = await this.channelsService.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only update custom channels');
    }

    const role = await this.channelMembersService.resolveChannelRole(
      requesterId,
      channel,
    );
    if (role !== 'channel_admin') {
      throw new ForbiddenException(
        'Only channel admins can update the channel',
      );
    }

    // 1. Process visibility change BEFORE saving name/description in this method
    if (dto.isPrivate !== undefined && dto.isPrivate !== channel.isPrivate) {
      channel = await this.setVisibility(channelId, dto.isPrivate, requesterId);
    }

    let hasChanges = false;
    if (dto.name !== undefined && dto.name !== channel.name) {
      channel.name = dto.name;
      hasChanges = true;
    }
    if (
      dto.description !== undefined &&
      dto.description !== channel.description
    ) {
      channel.description = dto.description;
      hasChanges = true;
    }

    if (hasChanges) {
      channel = await channel.save();
    }

    const envelope = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_UPDATED,
      data: channel,
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      envelope,
      'chat',
    );
    if (channel.workspaceId) {
      this.realtimePublisher.emit(
        RoomBuilder.workspace(channel.workspaceId.toString()),
        envelope,
        'chat',
      );
    }

    return channel;
  }

  async deleteCustomChannel(
    channelId: string,
    requesterId: string,
  ): Promise<void> {
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
      throw new BadRequestException('Can only delete custom channels');
    }

    const role = await this.channelMembersService.resolveChannelRole(
      requesterId,
      channel,
    );
    if (role !== 'channel_admin') {
      throw new ForbiddenException(
        'Only channel admins can delete this channel',
      );
    }

    const deleted = await this.channelsRepository.model
      .findByIdAndDelete(channelId)
      .exec();
    if (deleted) {
      const envelope = {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_DELETED,
        data: {
          channelId,
          workspaceId: channel.workspaceId?.toString() || null,
        },
        occurredAt: new Date().toISOString(),
      };
      this.realtimePublisher.emit(
        RoomBuilder.channel(channelId),
        envelope,
        'chat',
      );
      const wsId = channel.workspaceId?.toString();
      if (wsId) {
        this.realtimePublisher.emit(
          RoomBuilder.workspace(wsId),
          envelope,
          'chat',
        );
      }
    }
  }

  async setVisibility(
    channelId: string,
    isPrivate: boolean,
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
      throw new BadRequestException('Can only modify custom channels');
    }

    const role = await this.channelMembersService.resolveChannelRole(
      requesterId,
      channel,
    );
    if (role !== 'channel_admin') {
      throw new ForbiddenException('Only channel admins can change visibility');
    }

    if (channel.isPrivate === isPrivate) {
      return channel;
    }

    channel.isPrivate = isPrivate;
    const updated = await channel.save();

    if (!channel.workspaceId) {
      throw new BadRequestException('Channel must belong to a workspace');
    }
    const workspaceIdStr = channel.workspaceId.toString();
    const wsMembers =
      await this.workspaceMemberService.getMembers(workspaceIdStr);
    const wsUserIds = wsMembers
      .map(m => m.userId?.toString() || '')
      .filter(id => Types.ObjectId.isValid(id));

    let affectedUserIds: string[] = [];

    if (isPrivate) {
      const channelMemberIds = new Set(
        channel.channelMembers.map(m => m.userId.toString()),
      );
      affectedUserIds = wsUserIds.filter(id => !channelMemberIds.has(id));
    } else {
      affectedUserIds = wsUserIds;
    }

    const envelope = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_VISIBILITY_CHANGED,
      data: {
        channelId,
        isPrivate,
        workspaceId: workspaceIdStr,
        affectedUserIds,
      },
      occurredAt: new Date().toISOString(),
    };

    this.realtimePublisher.emit(
      RoomBuilder.workspace(workspaceIdStr),
      envelope,
      'chat',
    );

    return updated;
  }
}
