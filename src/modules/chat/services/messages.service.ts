import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { ChannelsService } from './channels.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    private readonly channelsService: ChannelsService,
  ) {}

  async send(
    channelId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('Invalid Channel ID');
    }

    const hasAccess = await this.channelsService.validateUserAccess(channelId, senderId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    if (dto.replyToId) {
      if (!Types.ObjectId.isValid(dto.replyToId)) {
        throw new NotFoundException('Invalid replyToId');
      }
      const parentMessage = await this.messageModel.findById(dto.replyToId);
      if (!parentMessage || parentMessage.channelId.toString() !== channelId) {
        throw new ForbiddenException('Cannot reply to message in a different channel');
      }
    }

    const message = await this.messageModel.create({
      ...dto,
      channelId: new Types.ObjectId(channelId),
      senderId: new Types.ObjectId(senderId),
    });

    return message.populate('senderId', 'fullName avatar email');
  }

  async findByChannel(
    channelId: string,
    userId: string,
    dto: CursorPaginationDto,
  ): Promise<{ messages: MessageDocument[]; nextCursor: string | null }> {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('Invalid Channel ID');
    }

    const hasAccess = await this.channelsService.validateUserAccess(channelId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const limit = dto.limit || 50;
    const query: any = { channelId: new Types.ObjectId(channelId) };

    if (dto.cursor) {
      if (!Types.ObjectId.isValid(dto.cursor)) {
        throw new NotFoundException('Invalid cursor');
      }
      query._id = { $lt: new Types.ObjectId(dto.cursor) };
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .populate('senderId', 'fullName avatar email')
      .exec();

    const nextCursor =
      messages.length === limit ? messages[messages.length - 1]._id.toString() : null;

    return { messages, nextCursor };
  }

  async edit(messageId: string, userId: string, content: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Invalid Message ID');
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('Only the sender can edit this message');
    }

    message.content = content;
    message.editedAt = new Date();
    return message.save();
  }

  async softDelete(messageId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Invalid Message ID');
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Only sender or workspace admin can delete
    const channel = await this.channelsService.findById(message.channelId.toString());
    let canDelete = message.senderId.toString() === userId;

    if (!canDelete && channel.workspaceId) {
      // Logic for workspace admin check could be added here if needed
    }

    if (!canDelete) {
      throw new ForbiddenException('You do not have permission to delete this message');
    }

    message.content = '[Message deleted]';
    message.deletedAt = new Date();
    await message.save();
  }

  async findById(id: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Message ID');
    }
    const message = await this.messageModel.findById(id).populate('senderId', 'fullName avatar email').exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }
}
