import {ForbiddenException,Inject,Injectable,Logger,NotFoundException,forwardRef} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { MessagesService } from './messages.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectModel(Channel.name) private readonly channelModel: Model<ChannelDocument>,
    @Inject(forwardRef(() => WorkspacesService))
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  async createGeneralChannel(): Promise<void> {
    const systemId = new Types.ObjectId('000000000000000000000000');

    // #general
    const general = await this.channelModel.findOne({ type: 'general' });
    if (!general) {
      this.logger.log('Initializing #general channel');
      await this.channelModel.create({
        name: 'general',
        type: 'general',
        description: 'General discussion for all members.',
        workspaceId: null,
        isPrivate: false,
        createdBy: systemId,
      });
    }

    // #announcements
    const announcements = await this.channelModel.findOne({ type: 'announcement' });
    if (!announcements) {
      this.logger.log('Initializing #announcements channel');
      await this.channelModel.create({
        name: 'announcements',
        type: 'announcement',
        description: 'Official system-wide announcements.',
        workspaceId: null,
        isPrivate: false,
        createdBy: systemId,
      });
    }

    // Sync: Ensure all existing workspaces have a channel
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
    this.logger.log(`Found channel: ${channel.name} (${id})`);
    return channel;
  }

  async findByUser(userId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const userWorkspaceIds = userWorkspaces.map(w => w._id);

    const channels = await this.channelModel.find({
      $or: [
        { type: 'general' },
        { type: 'announcement' },
        { workspaceId: { $in: userWorkspaceIds } },
      ]
    }).exec();

    this.logger.log(`Found ${channels.length} channels for user: ${userId}`);
    
    return Promise.all(
      channels.map(async (channel) => {
        const unreadCount = await this.messagesService.countUnread(channel._id.toString(), userId);
        return {
          ...channel.toObject(),
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

  async findByWorkspace(workspaceId: string): Promise<ChannelDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }
    const channels = await this.channelModel.find({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
    this.logger.log(`Found ${channels.length} channels for workspace: ${workspaceId}`);
    return channels;
  }

  async validateUserAccess(channelId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }
    
    const channel = await this.findById(channelId);
    this.logger.log(`Validating access for user ${userId} to channel: ${channel.name} (${channelId})`);
    
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

    return false;
  }
}
