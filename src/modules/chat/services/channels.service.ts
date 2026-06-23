import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChannelDocument } from '../schemas/channel.schema';
import { ChannelsRepository } from '../repositories/channels.repository';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { MessagesService } from './messages.service';
import { UsersService } from '../../users/services/users.service';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';

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
  ) { }

  async onModuleInit() {
    await this.ensureGlobalChannels();
    await this.syncWorkspaceChannels();
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
          $or: [
            { type: 'custom' },
            { workspaceId: { $ne: null } },
          ],
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

  async findByUser(userId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    // Self-healing: Always ensure global channels exist before fetching
    await this.ensureGlobalChannels();

    const { query, userWorkspaceIds } = await this.getChannelsQuery(userId);

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
    const hasAccess = await this.validateUserAccess(channelId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }
    await this.messagesService.markAsRead(channelId, userId);
  }

  async getOrCreateDM(userAId: string, userBId: string): Promise<any> {
    if (!Types.ObjectId.isValid(userBId)) {
      throw new BadRequestException('Invalid target user ID');
    }

    if (userAId === userBId) {
      throw new BadRequestException('Cannot create a DM with yourself');
    }

    const members = [userAId, userBId].sort();
    const memberObjectIds = members.map(id => new Types.ObjectId(id));

    // 1. Tìm kênh cũ bằng .lean()
    let channel: any = await this.channelsRepository.model
      .findOne({
        type: 'dm',
        members: { $all: memberObjectIds, $size: 2 },
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
          createdBy: new Types.ObjectId(userAId),
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
      userAId,
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

    const { query } = await this.getChannelsQuery(userId);

    const channels = await this.channelsRepository.model
      .find(query, { _id: 1 })
      .exec();

    return channels.map(c => c._id.toString());
  }

  private async getChannelsQuery(
    userId: string,
  ): Promise<{ query: any; userWorkspaceIds: Types.ObjectId[] }> {
    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const userWorkspaceIds = userWorkspaces.map(w => w._id);
    const user = await this.usersService.getUserById(userId);
    const isSuperAdmin = user?.role === 'super_admin';

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

    const query = isSuperAdmin
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

    return { query, userWorkspaceIds };
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
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }

    const channel = await this.findById(channelId);
    if (!channel) return false;

    const role = await this.resolveChannelRole(userId, channel);
    return role !== null && role !== 'not_joined';
  }

  async getChannelMemberIds(channelId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(channelId)) return [];

    const channel = await this.findById(channelId);
    if (!channel) return [];

    if (channel.type === 'general' || channel.type === 'announcement') {
      const allUsers = await this.usersService.getAllUsers();
      return allUsers
        .map(u => u._id?.toString() || (u as any).id?.toString() || '')
        .filter(id => Types.ObjectId.isValid(id));
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

    if (channel.type === 'general' || channel.type === 'announcement') {
      return this.usersService.searchUsers(query, userId);
    }

    const memberIds = await this.getChannelMemberIds(channelId);
    if (memberIds.length === 0) return [];

    const regex = new RegExp(query, 'i');
    const users = await this.usersService.getUsersByIds(memberIds);
    return users
      .filter(user => {
        const nameMatch = user.fullName && regex.test(user.fullName);
        const emailMatch = user.email && regex.test(user.email);
        const phoneMatch =
          (user as any).phone && regex.test((user as any).phone);
        return nameMatch || emailMatch || phoneMatch;
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

  async getChannelMembers(
    channelId: string,
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

  // ==========================================
  // CUSTOM CHANNELS LOGIC & HELPMETHODS
  // ==========================================

  async resolveChannelRole(
    userId: string,
    channel: any,
  ): Promise<'channel_admin' | 'channel_member' | 'not_joined' | null> {
    const user = await this.usersService.getUserById(userId);
    if (user?.role === 'super_admin') {
      return 'channel_admin';
    }

    let wsRole: string | null = null;
    if (channel.workspaceId) {
      wsRole = await this.workspaceMemberService.getMemberRole(
        channel.workspaceId.toString(),
        userId,
      );
    }

    if (wsRole === 'workspace_admin') {
      return 'channel_admin';
    }

    if (wsRole === 'viewer') {
      return null;
    }

    if (channel.type === 'custom') {
      if (!wsRole) return null;

      const channelMember = channel.channelMembers?.find(
        (m: any) => m.userId.toString() === userId,
      );

      if (!channelMember) {
        return channel.isPrivate ? null : 'not_joined';
      }

      return channelMember.role;
    }

    if (channel.type === 'general' || channel.type === 'announcement') {
      return 'channel_member';
    }

    if (channel.type === 'dm') {
      const isMember = channel.members.some((m: any) => m.toString() === userId);
      return isMember ? 'channel_member' : null;
    }

    if (channel.type === 'workspace') {
      return wsRole ? 'channel_member' : null;
    }

    return null;
  }

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

    const customChannelCount = await this.channelsRepository.model.countDocuments({
      workspaceId: new Types.ObjectId(workspaceId),
      type: 'custom',
    });
    if (customChannelCount >= 20) {
      throw new BadRequestException('Maximum limit of 20 custom channels reached for this workspace');
    }

    const wsRole = await this.workspaceMemberService.getMemberRole(workspaceId, createdBy);
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
    this.realtimePublisher.emit(RoomBuilder.workspace(workspaceId), envelope, 'chat');

    return channel;
  }

  async findWorkspaceCustomChannels(
    workspaceId: string,
    userId: string,
  ): Promise<ChannelDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) {
      return [];
    }

    const wsRole = await this.workspaceMemberService.getMemberRole(workspaceId, userId);
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
          { isPrivate: true, 'channelMembers.userId': new Types.ObjectId(userId) },
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
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(requesterId)) {
      throw new BadRequestException('Invalid IDs');
    }

    let channel = await this.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only update custom channels');
    }

    const role = await this.resolveChannelRole(requesterId, channel);
    if (role !== 'channel_admin') {
      throw new ForbiddenException('Only channel admins can update the channel');
    }

    if (dto.name !== undefined) {
      channel.name = dto.name;
    }
    if (dto.description !== undefined) {
      channel.description = dto.description;
    }

    await channel.save();

    if (dto.isPrivate !== undefined && dto.isPrivate !== channel.isPrivate) {
      channel = await this.setVisibility(channelId, dto.isPrivate, requesterId);
    } else {
      const envelope = {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.CHAT_CHANNEL_UPDATED,
        data: channel,
        occurredAt: new Date().toISOString(),
      };
      this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelope, 'chat');
      if (channel.workspaceId) {
        this.realtimePublisher.emit(RoomBuilder.workspace(channel.workspaceId.toString()), envelope, 'chat');
      }
    }

    return channel;
  }

  async deleteCustomChannel(
    channelId: string,
    requesterId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(requesterId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only delete custom channels');
    }

    const role = await this.resolveChannelRole(requesterId, channel);
    if (role !== 'channel_admin') {
      throw new ForbiddenException('Only channel admins can delete this channel');
    }

    const deleted = await this.channelsRepository.model.findByIdAndDelete(channelId).exec();
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
      this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelope, 'chat');
      const wsId = channel.workspaceId?.toString();
      if (wsId) {
        this.realtimePublisher.emit(RoomBuilder.workspace(wsId), envelope, 'chat');
      }
    }
  }

  async joinChannel(channelId: string, userId: string): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only join custom channels');
    }

    if (channel.isPrivate) {
      throw new ForbiddenException('Cannot join a private channel directly. You must be invited');
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
      throw new ForbiddenException('You do not have permission to join this channel');
    }

    const isAlreadyMember = channel.channelMembers?.some(
      m => m.userId.toString() === userId,
    );
    if (isAlreadyMember) {
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
    this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelope, 'chat');
    this.realtimePublisher.emit(RoomBuilder.workspace(workspaceIdStr), envelope, 'chat');

    return updated;
  }

  async leaveChannel(channelId: string, userId: string): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.findById(channelId);
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
          throw new BadRequestException('You are the last channel admin. Promote another member to admin before leaving');
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
    this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelope, 'chat');
    this.realtimePublisher.emit(RoomBuilder.workspace(workspaceIdStr), envelope, 'chat');

    return updated;
  }

  async inviteMembers(
    channelId: string,
    userIds: string[],
    requesterId: string,
  ): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(requesterId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.findById(channelId);
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
    const workspaceMembersSet = await this.workspaceMemberService.getMemberIdsSet(workspaceIdStr);

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
      this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelope, 'chat');
      this.realtimePublisher.emit(RoomBuilder.user(item.userId), envelope, 'chat');
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

    const channel = await this.findById(channelId);
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
    this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelopeRemoved, 'chat');

    const envelopeKicked = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_KICKED_FROM_CHANNEL,
      data: {
        channelId,
      },
      occurredAt: new Date().toISOString(),
    };
    this.realtimePublisher.emit(RoomBuilder.user(targetUserId), envelopeKicked, 'chat');

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

    const channel = await this.findById(channelId);
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
        { _id: channelId, 'channelMembers.userId': new Types.ObjectId(targetUserId) },
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
    this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelope, 'chat');

    return updated;
  }

  async setVisibility(
    channelId: string,
    isPrivate: boolean,
    requesterId: string,
  ): Promise<ChannelDocument> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(requesterId)) {
      throw new BadRequestException('Invalid IDs');
    }

    const channel = await this.findById(channelId);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'custom') {
      throw new BadRequestException('Can only modify custom channels');
    }

    const role = await this.resolveChannelRole(requesterId, channel);
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
    const wsMembers = await this.workspaceMemberService.getMembers(workspaceIdStr);
    const wsUserIds = wsMembers
      .map(m => m.userId?.toString() || '')
      .filter(id => Types.ObjectId.isValid(id));

    let affectedUserIds: string[] = [];

    if (isPrivate) {
      const channelMemberIds = new Set(channel.channelMembers.map(m => m.userId.toString()));
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

    this.realtimePublisher.emit(RoomBuilder.workspace(workspaceIdStr), envelope, 'chat');

    return updated;
  }

  async removeUserFromAllChannels(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) {
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
      this.realtimePublisher.emit(RoomBuilder.channel(channelId), envelopeRemoved, 'chat');

      const envelopeKicked = {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.CHAT_KICKED_FROM_CHANNEL,
        data: {
          channelId,
        },
        occurredAt: new Date().toISOString(),
      };
      this.realtimePublisher.emit(RoomBuilder.user(userId), envelopeKicked, 'chat');
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
}
