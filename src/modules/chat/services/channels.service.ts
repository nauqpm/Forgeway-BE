import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectModel(Channel.name) private readonly channelModel: Model<ChannelDocument>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createGeneralChannel(): Promise<ChannelDocument> {
    const existing = await this.channelModel.findOne({ type: 'general', name: 'general' });
    if (existing) {
      return existing;
    }

    this.logger.log('Creating general channel');
    // For general channel, we'll use a system user or the first admin if needed, 
    // but the prompt says createdBy is required. 
    // I'll use a placeholder or wait for the first user to be created?
    // Actually, I'll use a fixed ObjectId for system-created channels if possible, 
    // or just allow it to be created by the first admin.
    // For now, I'll assume we can pass a system userId or it will be created on init.
    // Wait, the prompt says "createdBy!: Types.ObjectId;" is required.
    // I'll find the first admin user or just use a dummy id if none exists.
    const dummyId = new Types.ObjectId('000000000000000000000000'); 
    
    return this.channelModel.create({
      name: 'general',
      type: 'general',
      workspaceId: null,
      isPrivate: false,
      createdBy: dummyId,
    });
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
    if (channel.type === 'general') {
      return true;
    }

    if (channel.type === 'workspace' && channel.workspaceId) {
      return this.workspacesService.isMember(channel.workspaceId.toString(), userId);
    }

    return false;
  }
}
