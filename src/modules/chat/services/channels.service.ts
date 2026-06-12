import { BadRequestException,ForbiddenException,Inject,Injectable,Logger,NotFoundException,forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { MessagesService } from './messages.service';
import { UsersService } from '../../users/services/users.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private initializationPromise: Promise<void> | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor(
    @InjectModel(Channel.name) private readonly channelModel: Model<ChannelDocument>,
    @Inject(forwardRef(() => WorkspacesService))
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    await this.ensureGlobalChannels();
    await this.syncWorkspaceChannels();
  }

  async ensureGlobalChannels(): Promise<void> {
    // Nếu đang có một quá trình khởi tạo diễn ra, đợi nó xong
    if (this.initializationPromise) {
      this.logger.debug('ensureGlobalChannels: Waiting for existing initialization to complete...');
      return this.initializationPromise;
    }

    // Tạo một promise mới để các request khác có thể đợi
    this.initializationPromise = (async () => {
      try {
        const systemId = new Types.ObjectId('000000000000000000000000');

        // Check #general
        const general = await this.channelModel.findOne({ type: 'general' });
        if (!general) {
          this.logger.log('Self-healing: Initializing missing #general channel');
          await this.channelModel.create({
            name: 'general',
            type: 'general',
            description: 'General discussion for all members.',
            workspaceId: null,
            isPrivate: false,
            createdBy: systemId,
          });
        }

        // Check #announcements
        const announcements = await this.channelModel.findOne({ type: 'announcement' });
        if (!announcements) {
          this.logger.log('Self-healing: Initializing missing #announcements channel');
          await this.channelModel.create({
            name: 'announcements',
            type: 'announcement',
            description: 'Official system-wide announcements.',
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
      this.logger.debug('syncWorkspaceChannels: Waiting for existing sync to complete...');
      return this.syncPromise;
    }

    this.syncPromise = (async () => {
      try {
        const systemId = new Types.ObjectId('000000000000000000000000');
        const allWorkspaces = await this.workspacesService.findAll();
        
        for (const workspace of allWorkspaces) {
          const workspaceId = workspace._id.toString();
          const channel = await this.channelModel.findOne({ 
            workspaceId: new Types.ObjectId(workspaceId),
            type: 'workspace' 
          });

          if (!channel) {
            this.logger.log(`Sync: Creating missing channel for workspace "${workspace.name}" (${workspaceId})`);
            await this.channelModel.create({
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

  async createWorkspaceChannel(workspaceId: string, createdBy: string): Promise<ChannelDocument> {
    this.logger.log(`Creating workspace channel for workspace: ${workspaceId}`);
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(createdBy)) {
      throw new Error('Invalid IDs');
    }

    const workspace = await this.workspacesService.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return this.channelModel.create({
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
    const channel = await this.channelModel.findById(id).exec();
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

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const userWorkspaceIds = userWorkspaces.map(w => w._id);

    let channels = await this.channelModel.find({
      $or: [
        { type: 'general' },
        { type: 'announcement' },
        { workspaceId: { $in: userWorkspaceIds } },
        { type: 'dm', members: new Types.ObjectId(userId) }
      ]
    }).exec();

    // If still missing workspace channels, trigger a sync (happens once if DB was wiped)
    if (channels.length < (userWorkspaceIds.length + 2)) {
      this.logger.log(`Missing channels detected for user ${userId}, triggering sync...`);
      await this.syncWorkspaceChannels();
      // Re-fetch after sync
      channels = await this.channelModel.find({
        $or: [
          { type: 'general' },
          { type: 'announcement' },
          { workspaceId: { $in: userWorkspaceIds } },
          { type: 'dm', members: new Types.ObjectId(userId) }
        ]
      }).exec();
    }

    this.logger.log(`Found ${channels.length} channels for user: ${userId}`);
    
    return Promise.all(
      channels.map(async (channel) => {
        const unreadCount = await this.messagesService.countUnread(channel._id.toString(), userId);
        
        // Manual Populate members for all channels (important for DM to show other user)
        const userInfos = await this.usersService.getUsersByIds(channel.members.map(m => m.toString()));

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
    let channel: any = await this.channelModel.findOne({
      type: 'dm',
      members: { $all: memberObjectIds, $size: 2 }
    })
    .lean()
    .exec();

    // 2. Nếu không thấy, tạo kênh mới
    if (!channel) {
      try {
        const created = await this.channelModel.create({
          type: 'dm',
          name: 'Direct Message',
          members: memberObjectIds,
          isPrivate: true,
          createdBy: new Types.ObjectId(userAId),
          workspaceId: null,
        });
        channel = created.toObject();
      } catch (error) {
        this.logger.error(`Failed to create DM channel: ${error.message}`, error.stack);
        throw new Error('Could not create DM channel');
      }
    }

    if (!channel) {
      throw new Error('Failed to retrieve or create DM channel');
    }

    // 3. MANUAL POPULATE: Lấy thông tin user thủ công để đảm bảo 100% thành công
    const userInfos = await this.usersService.getUsersByIds(members);
    const unreadCount = await this.messagesService.countUnread(channel._id.toString(), userAId);

    return {
      ...channel,
      members: userInfos, // Ghi đè mảng ID bằng mảng Object
      unreadCount,
    };
  }

  async getRecentDMs(userId: string): Promise<any[]> {
    const channels = await this.channelModel.find({
      type: 'dm',
      members: new Types.ObjectId(userId)
    })
    .sort({ 'lastMessage.sentAt': -1, updatedAt: -1 })
    .limit(20)
    .lean()
    .exec();

    // Add unread count AND Manual Populate members
    return Promise.all(
      channels.map(async (channel) => {
        const unreadCount = await this.messagesService.countUnread(channel._id.toString(), userId);
        const userInfos = await this.usersService.getUsersByIds(channel.members.map(m => m.toString()));
        
        return {
          ...channel,
          members: userInfos,
          unreadCount,
        };
      })
    );
  }

  async updateLastMessage(channelId: string, message: { content: string; senderId: any; senderName: string; sentAt: Date }) {
    return this.channelModel.findByIdAndUpdate(channelId, {
      $set: {
        lastMessage: {
          content: message.content,
          senderId: new Types.ObjectId(message.senderId.toString()),
          senderName: message.senderName,
          sentAt: message.sentAt,
        }
      }
    }, { new: true }).exec();
  }

  async searchUsers(query: string, excludeUserId: string) {
    return this.usersService.searchUsers(query, excludeUserId);
  }

  /** Lightweight version of findByUser to be used during Socket connection */
  async findMyChannelIds(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    
    // Use a direct query instead of workspacesService to avoid heavy counting logic
    const channels = await this.channelModel.find({
      $or: [
        { type: 'general' },
        { type: 'announcement' },
        { workspaceId: { $in: await this.getUserWorkspaceIds(userId) } },
        { type: 'dm', members: new Types.ObjectId(userId) }
      ]
    }, { _id: 1 }).exec();

    return channels.map(c => c._id.toString());
  }

  private async getUserWorkspaceIds(userId: string): Promise<Types.ObjectId[]> {
    const workspaces = await this.workspacesService.findByUserId(userId);
    return workspaces.map(w => w._id);
  }

  async findByWorkspace(workspaceId: string): Promise<ChannelDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }
    const channels = await this.channelModel.find({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
    this.logger.debug(`Found ${channels.length} channels for workspace: ${workspaceId}`);
    return channels;
  }

  async validateUserAccess(channelId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }
    
    const channel = await this.findById(channelId);
    this.logger.debug(`Validating access for user ${userId} to channel: ${channel.name} (${channelId})`);
    
    if (channel.type === 'general' || channel.type === 'announcement') {
      return true;
    }

    if (channel.type === 'workspace' && channel.workspaceId) {
      const isMember = await this.workspaceMemberService.isMember(channel.workspaceId.toString(), userId);
      if (!isMember) {
        this.logger.warn(`Access denied: User ${userId} is not a member of workspace ${channel.workspaceId} for channel ${channel.name}`);
      }
      return isMember;
    }

    if (channel.type === 'dm') {
      const isMember = channel.members.some(m => m.toString() === userId);
      if (!isMember) {
        this.logger.warn(`Access denied: User ${userId} is not a member of DM channel ${channelId}`);
      }
      return isMember;
    }

    return false;
  }

  async getChannelMemberIds(channelId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(channelId)) return [];
    
    const channel = await this.findById(channelId);
    if (!channel) return [];

    if (channel.type === 'general' || channel.type === 'announcement') {
      const allUsers = await this.usersService.getAllUsers();
      return allUsers.map((u) => u._id.toString());
    }

    if (channel.type === 'workspace' && channel.workspaceId) {
      const members = await this.workspaceMemberService.getMembers(channel.workspaceId.toString());
      return members.map((m) => m.userId.toString());
    }

    if (channel.type === 'dm') {
      return channel.members.map((m) => m.toString());
    }

    return [];
  }
}
