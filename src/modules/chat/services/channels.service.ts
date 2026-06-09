import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectModel(Channel.name) private readonly channelModel: Model<ChannelDocument>,
    @Inject(forwardRef(() => WorkspacesService))
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
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
        isPrivate: false,
        createdBy: systemId,
      });
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
    this.logger.debug(`Finding channel by id: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Channel ID');
    }
    const channel = await this.channelModel.findById(id).exec();
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  async findByUser(userId: string): Promise<ChannelDocument[]> {
    this.logger.debug(`Finding channels for user: ${userId}`);
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const userWorkspaceIds = userWorkspaces.map(w => w._id);

    return this.channelModel.find({
      $or: [
        { type: 'general' },
        { type: 'announcement' },
        { workspaceId: { $in: userWorkspaceIds } },
      ]
    }).exec();
  }

  async findByWorkspace(workspaceId: string): Promise<ChannelDocument[]> {
    this.logger.debug(`Finding channels for workspace: ${workspaceId}`);
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }
    return this.channelModel.find({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
  }

  async validateUserAccess(channelId: string, userId: string): Promise<boolean> {
    this.logger.debug(`Validating access for user ${userId} to channel ${channelId}`);
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }
    
    const channel = await this.findById(channelId);
    if (channel.type === 'general' || channel.type === 'announcement') {
      return true;
    }

    if (channel.type === 'workspace' && channel.workspaceId) {
      return this.workspaceMemberService.isMember(channel.workspaceId.toString(), userId);
    }

    return false;
  }
}
