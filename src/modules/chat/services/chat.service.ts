import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelDocument } from '../schemas/channel.schema';
import { Message, MessageDocument } from '../schemas/message.schema';

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    @InjectModel(Channel.name) private readonly channelModel: Model<ChannelDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultChannel();
  }

  private async ensureDefaultChannel() {
    const defaultChannel = await this.channelModel.findOne({ name: 'General' });
    if (!defaultChannel) {
      await this.channelModel.create({
        name: 'General',
        description: 'Public channel for everyone',
        type: 'public',
      });
    }
  }

  async getDefaultChannel() {
    return this.channelModel.findOne({ name: 'General' });
  }

  async createChannel(userId: string, data: { name: string; description?: string; type?: string }) {
    const channel = await this.channelModel.create({
      ...data,
      ownerId: new Types.ObjectId(userId),
      members: [{ userId: new Types.ObjectId(userId), role: 'admin' }],
    });
    return channel;
  }

  async getUserChannels(userId: string) {
    return this.channelModel.find({
      $or: [
        { type: 'public' },
        { 'members.userId': new Types.ObjectId(userId) }
      ]
    }).sort({ updatedAt: -1 });
  }

  async getChannelById(channelId: string) {
    return this.channelModel.findById(channelId);
  }

  async saveMessage(senderId: string, channelId: string, content: string) {
    const message = await this.messageModel.create({
      senderId: new Types.ObjectId(senderId),
      channelId: new Types.ObjectId(channelId),
      content,
    });

    await this.channelModel.findByIdAndUpdate(channelId, {
      lastMessageId: message._id,
    });

    return message.populate('senderId', 'firstName lastName avatar email');
  }

  async getMessages(channelId: string, limit = 50, before?: string) {
    const query: any = { channelId: new Types.ObjectId(channelId) };
    if (before) {
      query._id = { $lt: new Types.ObjectId(before) };
    }

    return this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'firstName lastName avatar email')
      .exec();
  }
}
