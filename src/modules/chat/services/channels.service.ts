import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { ChannelDocument } from '../schemas/channel.schema';
import { ChannelsRepository } from '../repositories/channels.repository';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { MessagesService } from './messages.service';
import { UsersService } from '../../users/services/users.service';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { DOMAIN_EVENT_TYPES } from '../../../shared/events/domain-events/domain-event-types';
import { ChannelMembersService } from './channel-members.service';
import { CustomChannelsService } from './custom-channels.service';
import { UpdateChannelDto } from '../dtos/update-channel.dto';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private initializationPromise: Promise<void> | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor(
    private readonly channelsRepository: ChannelsRepository,
    @Inject(forwardRef(() => WorkspacesService))
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly realtimePublisher: RealtimePublisher,
    @Inject(forwardRef(() => ChannelMembersService))
    private readonly channelMembersService: ChannelMembersService,
    @Inject(forwardRef(() => CustomChannelsService))
    private readonly customChannelsService: CustomChannelsService,
  ) {}

  async onModuleInit() {
    await this.ensureGlobalChannels();
    await this.syncWorkspaceChannels();
    await this.cleanupOrphanedAndDemotedMembers();
  }

  async ensureGlobalChannels(): Promise<void> {
    // Nếu đang có một quá trình khởi tạo diễn ra, đợi nó xong
    if (this.initializationPromise) {
      this.logger.debug(
        'ensureGlobalChannels: Waiting for existing initialization to complete...',
      );
      return this.initializationPromise;
    }

    // Tạo một promise mới để các request khác có thể đợi
    this.initializationPromise = (async () => {
      try {
        const systemId = new Types.ObjectId('000000000000000000000000');

        // Clean up any incorrect just-for-fun channels (type custom or workspaceId is not null)
        await this.channelsRepository.model.deleteMany({
          name: 'just-for-fun',
          $or: [{ type: 'custom' }, { workspaceId: { $ne: null } }],
        });

        // Check #general
        const general = await this.channelsRepository.model.findOne({
          type: 'general',
          name: 'general',
        });
        if (!general) {
          this.logger.log(
            'Self-healing: Initializing missing #general channel',
          );
          await this.channelsRepository.model.create({
            name: 'general',
            type: 'general',
            description: 'General discussion for all members.',
            workspaceId: null,
            isPrivate: false,
            createdBy: systemId,
          });
        }

        // Check #announcements
        const announcements = await this.channelsRepository.model.findOne({
          type: 'announcement',
          name: 'announcements',
        });
        if (!announcements) {
          this.logger.log(
            'Self-healing: Initializing missing #announcements channel',
          );
          await this.channelsRepository.model.create({
            name: 'announcements',
            type: 'announcement',
            description: 'Official system-wide announcements.',
            workspaceId: null,
            isPrivate: false,
            createdBy: systemId,
          });
        }

        // Check #just-for-fun
        const justForFun = await this.channelsRepository.model.findOne({
          type: 'general',
          name: 'just-for-fun',
        });
        if (!justForFun) {
          this.logger.log(
            'Self-healing: Initializing missing #just-for-fun channel',
          );
          await this.channelsRepository.model.create({
            name: 'just-for-fun',
            type: 'general',
            description: 'Just for fun discussion for all members.',
            workspaceId: null,
            isPrivate: false,
            createdBy: systemId,
          });
        }
      } finally {
        // Reset promise để lần gọi sau (nếu cần) có thể chạy lại
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  async syncWorkspaceChannels(): Promise<void> {
    if (this.syncPromise) {
      this.logger.debug(
        'syncWorkspaceChannels: Waiting for existing sync to complete...',
      );
      return this.syncPromise;
    }

    this.syncPromise = (async () => {
      try {
        const systemId = new Types.ObjectId('000000000000000000000000');
        const allWorkspaces = await this.workspacesService.findAll();

        for (const workspace of allWorkspaces) {
          const workspaceId = workspace._id.toString();
          const channel = await this.channelsRepository.model.findOne({
            workspaceId: new Types.ObjectId(workspaceId),
            type: 'workspace',
          });

          if (!channel) {
            this.logger.log(
              `Sync: Creating missing channel for workspace "${workspace.name}" (${workspaceId})`,
            );
            await this.channelsRepository.model.create({
              name: workspace.name,
              type: 'workspace',
              description: `Discussion channel for the ${workspace.name} workspace.`,
              workspaceId: new Types.ObjectId(workspaceId),
              isPrivate: false,
              createdBy: workspace.ownerId || systemId,
            });
          }
        }
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  async createWorkspaceChannel(
    workspaceId: string,
    createdBy: string,
  ): Promise<ChannelDocument> {
    this.logger.log(`Creating workspace channel for workspace: ${workspaceId}`);
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(createdBy)
    ) {
      throw new Error('Invalid IDs');
    }

    const workspace = await this.workspacesService.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return this.channelsRepository.model.create({
      name: workspace.name,
      type: 'workspace',
      workspaceId: new Types.ObjectId(workspaceId),
      isPrivate: false,
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  async findById(id: string): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Channel ID');
    }
    const channel = await this.channelsRepository.model.findById(id).exec();
    if (!channel) {
      this.logger.debug(`Channel not found: ${id}`);
      throw new NotFoundException('Channel not found');
    }
    this.logger.debug(`Found channel: ${channel.name} (${id})`);
    return channel;
  }

  async updateChannel(
    id: string,
    userId: string,
    updateData: UpdateChannelDto,
  ): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid Channel ID');
    }
    const hasAccess = await this.validateUserAccess(id, userId, true);
    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to update this channel',
      );
    }
    const channel = await this.channelsRepository.model
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  async findByUser(userId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    // Self-healing: Always ensure global channels exist before fetching
    await this.ensureGlobalChannels();

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const userWorkspaceIds = userWorkspaces.map(w => w._id);
    const user = await this.usersService.getUserById(userId);
    const isSuperAdmin = user?.role === 'super_admin';

    const query = this.buildChannelsQuery(userId, userWorkspaces, isSuperAdmin);

    let channels = await this.channelsRepository.model.find(query).exec();

    // Verify if workspace channels are missing by comparing count of type 'workspace'
    const workspaceChannels = channels.filter(c => c.type === 'workspace');
    if (workspaceChannels.length < userWorkspaceIds.length) {
      this.logger.log(
        `Missing workspace channels detected for user ${userId}, triggering sync...`,
      );
      await this.syncWorkspaceChannels();
      // Re-fetch after sync
      channels = await this.channelsRepository.model.find(query).exec();
    }

    this.logger.log(`Found ${channels.length} channels for user: ${userId}`);

    return Promise.all(
      channels.map(async channel => {
        const unreadCount = await this.messagesService.countUnread(
          channel._id.toString(),
          userId,
        );

        // Manual Populate members based on channel type (skip for general/announcement)
        let userInfos: any[] = [];
        if (channel.type !== 'general' && channel.type !== 'announcement') {
          const memberIds = await this.getChannelMemberIds(
            channel._id.toString(),
          );
          const validMemberIds = memberIds.filter(
            id => id && Types.ObjectId.isValid(id),
          );
          userInfos = await this.usersService.getUsersByIds(validMemberIds);
        }

        return {
          ...channel.toObject(),
          members: userInfos,
          unreadCount,
        };
      }),
    );
  }

  async markAsRead(channelId: string, userId: string): Promise<void> {
    const hasAccess = await this.validateUserAccess(channelId, userId, true);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }
    await this.messagesService.markAsRead(channelId, userId);
  }

  async getOrCreateDM(userId: string, targetUserIds: string[]): Promise<any> {
    if (!targetUserIds || targetUserIds.length === 0) {
      throw new BadRequestException('Must provide at least one target user ID');
    }

    const uniqueMembers = Array.from(new Set([userId, ...targetUserIds]));

    if (uniqueMembers.length < 2) {
      throw new BadRequestException('Cannot create a DM with only yourself');
    }

    uniqueMembers.forEach(id => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid user ID: ${id}`);
      }
    });

    const members = uniqueMembers.sort();
    const memberObjectIds = members.map(id => new Types.ObjectId(id));

    // 1. Tìm kênh cũ bằng .lean()
    let channel: any = await this.channelsRepository.model
      .findOne({
        type: 'dm',
        members: { $all: memberObjectIds, $size: memberObjectIds.length },
      })
      .lean()
      .exec();

    // 2. Nếu không thấy, tạo kênh mới
    if (!channel) {
      try {
        const created = await this.channelsRepository.model.create({
          type: 'dm',
          name: 'Direct Message',
          members: memberObjectIds,
          isPrivate: true,
          createdBy: new Types.ObjectId(userId),
          workspaceId: null,
        });
        channel = created.toObject();
      } catch (error: any) {
        this.logger.error(
          `Failed to create DM channel: ${error.message}`,
          error.stack,
        );
        throw new Error('Could not create DM channel');
      }
    }

    if (!channel) {
      throw new Error('Failed to retrieve or create DM channel');
    }

    // 3. MANUAL POPULATE: Lấy thông tin user thủ công để đảm bảo 100% thành công
    const userInfos = await this.usersService.getUsersByIds(members);
    const unreadCount = await this.messagesService.countUnread(
      channel._id.toString(),
      userId,
    );

    return {
      ...channel,
      members: userInfos, // Ghi đè mảng ID bằng mảng Object
      unreadCount,
    };
  }

  async getRecentDMs(userId: string): Promise<any[]> {
    const channels = await this.channelsRepository.model
      .find({
        type: 'dm',
        members: new Types.ObjectId(userId),
      })
      .sort({ 'lastMessage.sentAt': -1, updatedAt: -1 })
      .limit(20)
      .lean()
      .exec();

    // Add unread count AND Manual Populate members
    return Promise.all(
      channels.map(async channel => {
        const unreadCount = await this.messagesService.countUnread(
          channel._id.toString(),
          userId,
        );
        const userInfos = await this.usersService.getUsersByIds(
          channel.members.map(m => m.toString()),
        );

        return {
          ...channel,
          members: userInfos,
          unreadCount,
        };
      }),
    );
  }

  async updateLastMessage(
    channelId: string,
    message: {
      content?: string;
      senderId: any;
      senderName: string;
      sentAt: Date;
      type?: string;
    },
  ) {
    const rawSenderId = message.senderId;
    const senderStrId =
      typeof rawSenderId === 'object' && rawSenderId
        ? (rawSenderId._id || rawSenderId.id || rawSenderId).toString()
        : rawSenderId?.toString() || '';

    const senderObjectId = Types.ObjectId.isValid(senderStrId)
      ? new Types.ObjectId(senderStrId)
      : null;

    return this.channelsRepository.model
      .findByIdAndUpdate(
        channelId,
        {
          $set: {
            lastMessage: {
              content: message.content || '',
              senderId: senderObjectId,
              senderName: message.senderName,
              sentAt: message.sentAt,
              type: message.type,
            },
          },
        },
        { new: true },
      )
      .exec();
  }

  async searchUsers(query: string, excludeUserId: string) {
    return this.usersService.searchUsers(query, excludeUserId);
  }

  /** Lightweight version of findByUser to be used during Socket connection */
  async findMyChannelIds(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) return [];

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const user = await this.usersService.getUserById(userId);
    const isSuperAdmin = user?.role === 'super_admin';

    const query = this.buildChannelsQuery(userId, userWorkspaces, isSuperAdmin);

    const channels = await this.channelsRepository.model
      .find(query, { _id: 1 })
      .exec();

    return channels.map(c => c._id.toString());
  }

  private buildChannelsQuery(
    userId: string,
    userWorkspaces: any[],
    isSuperAdmin: boolean,
  ): any {
    const adminWorkspaceIds: Types.ObjectId[] = [];
    const memberWorkspaceIds: Types.ObjectId[] = [];

    for (const ws of userWorkspaces) {
      const wsId = ws._id;
      const isOwner = ws.ownerId?.toString() === userId;
      const member = ws.members?.find(
        (m: any) => m.userId?.toString() === userId,
      );
      const isAdmin = isOwner || member?.role === 'workspace_admin';

      if (isSuperAdmin || isAdmin) {
        adminWorkspaceIds.push(wsId);
      } else {
        memberWorkspaceIds.push(wsId);
      }
    }

    return isSuperAdmin
      ? {
          $or: [
            { type: 'general' },
            { type: 'announcement' },
            { workspaceId: { $in: adminWorkspaceIds } },
            { type: 'dm', members: new Types.ObjectId(userId) },
          ],
        }
      : {
          $or: [
            { type: 'general' },
            { type: 'announcement' },
            { workspaceId: { $in: adminWorkspaceIds } },
            { workspaceId: { $in: memberWorkspaceIds }, type: 'workspace' },
            {
              workspaceId: { $in: memberWorkspaceIds },
              type: 'custom',
              isPrivate: false,
            },
            {
              workspaceId: { $in: memberWorkspaceIds },
              type: 'custom',
              isPrivate: true,
              'channelMembers.userId': new Types.ObjectId(userId),
            },
            { type: 'dm', members: new Types.ObjectId(userId) },
          ],
        };
  }

  async findByWorkspace(workspaceId: string): Promise<ChannelDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }
    const channels = await this.channelsRepository.model
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    this.logger.debug(
      `Found ${channels.length} channels for workspace: ${workspaceId}`,
    );
    return channels;
  }
  async validateUserAccess(
    channelId: string,
    userId: string,
    _isWrite: boolean = false,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }

    const channel = await this.findById(channelId);
    if (!channel) return false;

    const role = await this.channelMembersService.resolveChannelRole(
      userId,
      channel,
    );
    if (role === null || role === 'not_joined') return false;
    return true;
  }

  async getChannelMemberIds(channelId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(channelId)) return [];

    const channel = await this.findById(channelId);
    if (!channel) return [];

    if (channel.type === 'general' || channel.type === 'announcement') {
      return this.usersService.getAllUserIds();
    }

    if (channel.type === 'workspace' && channel.workspaceId) {
      const members = await this.workspaceMemberService.getMembers(
        channel.workspaceId.toString(),
      );
      return members
        .map(m => {
          const uId =
            typeof m.userId === 'object' && m.userId
              ? m.userId._id || m.userId.id
              : m.userId;
          return uId ? uId.toString() : '';
        })
        .filter(id => Types.ObjectId.isValid(id));
    }

    if (channel.type === 'dm') {
      return channel.members
        .map(m => m.toString())
        .filter(id => Types.ObjectId.isValid(id));
    }

    if (channel.type === 'custom') {
      return channel.channelMembers
        .map(m => m.userId.toString())
        .filter(id => Types.ObjectId.isValid(id));
    }

    return [];
  }

  async searchMentionMembers(
    channelId: string,
    query: string,
    userId: string,
  ): Promise<any[]> {
    const hasAccess = await this.validateUserAccess(channelId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const channel = await this.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const cleanQuery = (query || '').replace(/^@+/, '').trim();
    const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (channel.type === 'general' || channel.type === 'announcement') {
      return this.usersService.searchUsers(cleanQuery, userId);
    }

    const memberIds = await this.getChannelMemberIds(channelId);
    if (memberIds.length === 0) return [];

    const regex = new RegExp(escapedQuery, 'i');
    const users = await this.usersService.getUsersByIds(memberIds);
    return users
      .filter(user => {
        const nameMatch = user.fullName && regex.test(user.fullName);
        const emailMatch = user.email && regex.test(user.email);
        const phoneMatch =
          (user as any).phone && regex.test((user as any).phone);
        return nameMatch || emailMatch || phoneMatch;
      })
      .sort((a, b) => {
        const q = cleanQuery.toLowerCase();
        const aEmail = (a.email || '').toLowerCase();
        const bEmail = (b.email || '').toLowerCase();
        const aName = (a.fullName || '').toLowerCase();
        const bName = (b.fullName || '').toLowerCase();

        const aExact = aEmail === q || aName === q;
        const bExact = bEmail === q || bName === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = aEmail.startsWith(q) || aName.startsWith(q);
        const bStarts = bEmail.startsWith(q) || bName.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return 0;
      })
      .slice(0, 10);
  }

  async getChannelDetailsForUser(
    channelId: string,
    userId: string,
  ): Promise<any> {
    const hasAccess = await this.validateUserAccess(channelId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const channel = await this.findById(channelId);
    const unreadCount = await this.messagesService.countUnread(
      channelId,
      userId,
    );

    // Skip member loading for general/announcement channels
    let userInfos: any[] = [];
    if (channel.type !== 'general' && channel.type !== 'announcement') {
      const memberIds = await this.getChannelMemberIds(channelId);
      const validMemberIds = memberIds.filter(
        id => id && Types.ObjectId.isValid(id),
      );
      userInfos = await this.usersService.getUsersByIds(validMemberIds);
    }

    return {
      ...channel.toObject(),
      members: userInfos,
      unreadCount,
    };
  }

  async getChannelMembers(channelId: string, userId: string): Promise<any[]> {
    const hasAccess = await this.validateUserAccess(channelId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const channel = await this.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // For workspace channels, include role info
    if (channel.type === 'workspace' && channel.workspaceId) {
      const workspaceMembers = await this.workspaceMemberService.getMembers(
        channel.workspaceId.toString(),
      );
      const memberIds = workspaceMembers
        .map(m => {
          const uId =
            typeof m.userId === 'object' && m.userId
              ? m.userId._id || m.userId.id
              : m.userId;
          return uId ? uId.toString() : '';
        })
        .filter(id => Types.ObjectId.isValid(id));

      if (memberIds.length === 0) return [];

      const users = await this.usersService.getUsersByIds(memberIds);

      // Build a role map from workspace members
      const roleMap = new Map<string, string>();
      for (const wm of workspaceMembers) {
        const uId =
          typeof wm.userId === 'object' && wm.userId
            ? wm.userId._id || wm.userId.id
            : wm.userId;
        if (uId) roleMap.set(uId.toString(), wm.role || 'member');
      }

      return users.map(u => ({
        _id: u._id?.toString() || (u as any).id?.toString(),
        fullName: u.fullName,
        email: u.email,
        phone: (u as any).phone,
        avatar: (u as any).avatar,
        role: roleMap.get(u._id?.toString() || '') || 'member',
        globalRole: u.role,
      }));
    }

    // For custom channels
    if (channel.type === 'custom') {
      const memberIds = channel.channelMembers
        .map(m => m.userId.toString())
        .filter(id => Types.ObjectId.isValid(id));

      if (memberIds.length === 0) return [];

      const users = await this.usersService.getUsersByIds(memberIds);

      const roleMap = new Map<string, string>();
      for (const cm of channel.channelMembers) {
        if (cm.userId) roleMap.set(cm.userId.toString(), cm.role);
      }

      return users.map(u => ({
        _id: u._id?.toString() || (u as any).id?.toString(),
        fullName: u.fullName,
        email: u.email,
        phone: (u as any).phone,
        avatar: (u as any).avatar,
        role: roleMap.get(u._id?.toString() || '') || 'channel_member',
        globalRole: u.role,
      }));
    }

    // For general/announcement — all users
    if (channel.type === 'general' || channel.type === 'announcement') {
      const allUsers = await this.usersService.getAllUsers();
      return allUsers.map(u => ({
        _id: u._id?.toString() || (u as any).id?.toString(),
        fullName: u.fullName,
        email: u.email,
        phone: (u as any).phone,
        avatar: (u as any).avatar,
        role: u.role || 'user',
      }));
    }

    // For DM
    if (channel.type === 'dm') {
      const memberIds = channel.members
        .map(m => m.toString())
        .filter(id => Types.ObjectId.isValid(id));
      if (memberIds.length === 0) return [];

      const users = await this.usersService.getUsersByIds(memberIds);
      return users.map(u => ({
        _id: u._id?.toString() || (u as any).id?.toString(),
        fullName: u.fullName,
        email: u.email,
        phone: (u as any).phone,
        avatar: (u as any).avatar,
      }));
    }

    return [];
  }

  async removeUserFromAllChannels(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return;
    }

    await this.channelsRepository.model.updateMany(
      { workspaceId: new Types.ObjectId(workspaceId), type: 'custom' },
      { $pull: { channelMembers: { userId: new Types.ObjectId(userId) } } },
    );

    const channels = await this.channelsRepository.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), type: 'custom' })
      .exec();

    for (const ch of channels) {
      const channelId = ch._id.toString();

      const envelopeRemoved = {
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
        RoomBuilder.user(userId),
        envelopeKicked,
        'chat',
      );
    }
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_REMOVED, { async: true })
  async handleWorkspaceMemberRemoved(event: any): Promise<void> {
    const workspaceId = event.workspaceId || event.data?.workspaceId;
    const userId = event.userId || event.data?.userId;
    if (workspaceId && userId) {
      this.logger.log(
        `Cascade: Workspace member removed event received. Removing user ${userId} from all custom channels in workspace ${workspaceId}`,
      );
      await this.removeUserFromAllChannels(workspaceId, userId);
    }
  }

  @OnEvent('user.deleted', { async: true })
  async handleUserDeleted(event: { userId: string }): Promise<void> {
    const { userId } = event;
    if (userId) {
      this.logger.log(
        `Cascade: User deleted event received. Cleaning up user ${userId} from all channels`,
      );
      await this.cleanupUserMemberships(userId);
    }
  }

  async cleanupUserMemberships(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      return;
    }

    const userObjectId = new Types.ObjectId(userId);

    try {
      // Find all custom channels the user was in to notify client via socket (do this before pulling them)
      const affectedCustomChannels = await this.channelsRepository.model
        .find({
          type: 'custom',
          'channelMembers.userId': userObjectId,
        })
        .exec();

      // 1. Pull user from custom channels' channelMembers
      await this.channelsRepository.model.updateMany(
        { type: 'custom' },
        { $pull: { channelMembers: { userId: userObjectId } } },
      );

      // 2. Pull user from dm channels' members
      await this.channelsRepository.model.updateMany(
        { type: 'dm' },
        { $pull: { members: userObjectId } },
      );

      // 3. Update createdBy to system ID for channels created by the deleted user
      const systemId = new Types.ObjectId('000000000000000000000000');
      await this.channelsRepository.model.updateMany(
        { createdBy: userObjectId },
        { $set: { createdBy: systemId } },
      );

      // 4. Update lastMessage.senderName to 'Deleted User' for channels where this user was the last sender
      await this.channelsRepository.model.updateMany(
        { 'lastMessage.senderId': userObjectId },
        { $set: { 'lastMessage.senderName': 'Deleted User' } },
      );

      // 3. Emit member removed socket events for affected custom channels
      for (const channel of affectedCustomChannels) {
        const channelId = channel._id.toString();
        const envelopeRemoved = {
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
          envelopeRemoved,
          'chat',
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to clean up user channels on delete: ${err.message}`,
        err.stack,
      );
    }
  }

  async cleanupOrphanedAndDemotedMembers(): Promise<void> {
    this.logger.log('Running cleanup of channelMembers for custom channels...');
    try {
      const channels = await this.channelsRepository.model
        .find({ type: 'custom', isPrivate: true })
        .exec();

      for (const channel of channels) {
        if (!channel.workspaceId) continue;

        let workspace: any;
        try {
          workspace = await this.workspacesService.findById(
            channel.workspaceId.toString(),
          );
        } catch {
          continue;
        }
        if (!workspace) continue;

        const admins = new Set(
          workspace.members
            ?.filter((m: any) => m.role === 'workspace_admin')
            ?.map((m: any) => m.userId?.toString()) || [],
        );

        const wsUserIds = new Set(
          workspace.members
            ?.map((m: any) => {
              const uId =
                typeof m.userId === 'object' && m.userId
                  ? m.userId._id || m.userId.id
                  : m.userId;
              return uId ? uId.toString() : '';
            })
            .filter(Boolean) || [],
        );

        const originalCount = channel.channelMembers.length;
        let modified = false;

        channel.channelMembers = channel.channelMembers.filter((m: any) => {
          const userIdStr = m.userId.toString();

          // 1. If user is no longer a member of the workspace, remove them from the custom channel entirely
          if (!wsUserIds.has(userIdStr)) {
            modified = true;
            return false;
          }

          // 2. If they are a channel_admin but no longer workspace_admin and not the creator, downgrade them to channel_member
          const isWorkspaceAdmin = admins.has(userIdStr);
          const isCreator = channel.createdBy?.toString() === userIdStr;
          const isChannelAdmin = m.role === 'channel_admin';

          if (!isWorkspaceAdmin && !isCreator && isChannelAdmin) {
            m.role = 'channel_member';
            modified = true;
          }

          return true;
        });

        if (modified || channel.channelMembers.length !== originalCount) {
          this.logger.log(
            `Cleanup: Cleaned up orphaned members / demoted admins for channel ${channel.name} (${channel._id})`,
          );
          await channel.save();
        }
      }
      this.logger.log('Cleanup of channelMembers completed.');
    } catch (error) {
      this.logger.error('Failed to run cleanup of channelMembers', error);
    }
  }

  @OnEvent(DOMAIN_EVENT_TYPES.WORKSPACE_MEMBER_ROLE_UPDATED, { async: true })
  async handleWorkspaceMemberRoleUpdated(event: any): Promise<void> {
    const workspaceId = event.workspaceId || event.data?.workspaceId;
    const userId = event.userId || event.data?.userId;
    const nextRole = event.nextRole || event.data?.nextRole;

    if (workspaceId && userId && nextRole && nextRole !== 'workspace_admin') {
      this.logger.log(
        `Cascade: Workspace member role updated to ${nextRole} for user ${userId}. Checking if we need to remove from private custom channels.`,
      );
      try {
        const privateChannels = await this.channelsRepository.model
          .find({
            workspaceId: new Types.ObjectId(workspaceId),
            type: 'custom',
            isPrivate: true,
            'channelMembers.userId': new Types.ObjectId(userId),
          })
          .exec();

        for (const channel of privateChannels) {
          if (channel.createdBy?.toString() !== userId) {
            this.logger.log(
              `Removing demoted user ${userId} from private custom channel ${channel.name} (${channel._id})`,
            );
            await this.channelsRepository.model
              .findByIdAndUpdate(channel._id, {
                $pull: {
                  channelMembers: { userId: new Types.ObjectId(userId) },
                },
              })
              .exec();

            const channelId = channel._id.toString();

            const envelopeRemoved = {
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
              RoomBuilder.user(userId),
              envelopeKicked,
              'chat',
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to process workspace member role updated for user ${userId}`,
          error,
        );
      }
    }
  }
}
