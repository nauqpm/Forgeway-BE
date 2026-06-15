import {
  Inject,
  forwardRef,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import {
  ChannelReadMarker,
  ChannelReadMarkerDocument,
} from '../schemas/channel-read-marker.schema';
import { ChannelsService } from './channels.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';
import { UsersService } from '../../users/services/users.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(ChannelReadMarker.name)
    private readonly readMarkerModel: Model<ChannelReadMarkerDocument>,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => WorkspaceMemberService))
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

  async countUnread(channelId: string, userId: string): Promise<number> {
    const marker = await this.readMarkerModel.findOne({
      channelId: new Types.ObjectId(channelId),
      userId: new Types.ObjectId(userId),
    });

    const lastReadAt = marker?.lastReadAt || new Date(0);

    return this.messageModel.countDocuments({
      channelId: new Types.ObjectId(channelId),
      senderId: { $ne: new Types.ObjectId(userId) },
      createdAt: { $gt: lastReadAt },
      deletedAt: null,
    });
  }

  async getReactions(messageId: string): Promise<Record<string, string[]>> {
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) return {};

    const result: Record<string, string[]> = {};
    if (message.reactions) {
      for (const [emoji, userIds] of message.reactions.entries()) {
        result[emoji] = userIds.map(id => id.toString());
      }
    }
    return result;
  }

  async populateReactions(messages: MessageDocument[]): Promise<any[]> {
    return messages.map(m => {
      const obj = m.toObject();
      const reactionsRecord: Record<string, string[]> = {};
      if (m.reactions) {
        for (const [emoji, userIds] of m.reactions.entries()) {
          reactionsRecord[emoji] = userIds.map(id => id.toString());
        }
      }
      obj.reactions = reactionsRecord;
      return obj;
    });
  }

  async markAsRead(channelId: string, userId: string): Promise<void> {
    await this.readMarkerModel.updateOne(
      {
        channelId: new Types.ObjectId(channelId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { lastReadAt: new Date() },
      },
      { upsert: true },
    );
  }

  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Invalid Message ID');
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (!message.reactions) {
      message.reactions = new Map<string, Types.ObjectId[]>();
    }

    const userObjectId = new Types.ObjectId(userId);
    const existingList = message.reactions.get(emoji) || [];

    const userIndex = existingList.findIndex(id => id.toString() === userId);

    if (userIndex > -1) {
      // Remove reaction
      existingList.splice(userIndex, 1);
      if (existingList.length === 0) {
        message.reactions.delete(emoji);
      } else {
        message.reactions.set(emoji, existingList);
      }
      message.markModified('reactions');
      await message.save();
      return { action: 'removed', emoji };
    } else {
      // Add reaction
      existingList.push(userObjectId);
      message.reactions.set(emoji, existingList);
      message.markModified('reactions');
      await message.save();
      return { action: 'added', emoji };
    }
  }

  async send(
    channelId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('Invalid Channel ID');
    }

    const channel = await this.channelsService.findById(channelId);

    const hasAccess = await this.channelsService.validateUserAccess(
      channelId,
      senderId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    // FR-CHAT-002: Announcements only for Super Admin
    if (channel.type === 'announcement') {
      const user = await this.usersService.getUserById(senderId);
      if (user?.role !== GLOBAL_ROLES.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only Super Admin can post in Announcements',
        );
      }
    }

    if (dto.replyToId) {
      if (!Types.ObjectId.isValid(dto.replyToId)) {
        throw new NotFoundException('Invalid replyToId');
      }
      const parentMessage = await this.messageModel.findById(dto.replyToId);
      if (!parentMessage || parentMessage.channelId.toString() !== channelId) {
        throw new ForbiddenException(
          'Cannot reply to message in a different channel',
        );
      }
    }

    const message = await this.messageModel.create({
      ...dto,
      channelId: new Types.ObjectId(channelId),
      senderId: new Types.ObjectId(senderId),
    });

    const populated = await message.populate('senderId', 'fullName avatar email');
    const [withReactions] = await this.populateReactions([populated]);
    return withReactions;
  }

  async findByChannel(
    channelId: string,
    userId: string,
    dto: CursorPaginationDto,
  ): Promise<{ messages: any[]; nextCursor: string | null }> {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('Invalid Channel ID');
    }

    const hasAccess = await this.channelsService.validateUserAccess(
      channelId,
      userId,
    );
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
      messages.length === limit
        ? messages[messages.length - 1]._id.toString()
        : null;

    return {
      messages: await this.populateReactions(messages),
      nextCursor,
    };
  }

  async edit(messageId: string, userId: string, content: string): Promise<any> {
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
    await message.save();
    
    const populated = await message.populate('senderId', 'fullName avatar email');
    const [withReactions] = await this.populateReactions([populated]);
    return withReactions;
  }

  async softDelete(messageId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Invalid Message ID');
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const user = await this.usersService.getUserById(userId);
    const channel = await this.channelsService.findById(
      message.channelId.toString(),
    );

    let canDelete = false;

    // 1. Super Admin can delete anything
    if (user?.role === GLOBAL_ROLES.SUPER_ADMIN) {
      canDelete = true;
    }
    // 2. Sender can delete their own
    else if (message.senderId.toString() === userId) {
      canDelete = true;
    }
    // 3. Workspace Admin can delete messages in their workspace channel
    else if (channel.type === 'workspace' && channel.workspaceId) {
      const wsRole = await this.workspaceMemberService.getMemberRole(
        channel.workspaceId.toString(),
        userId,
      );
      if (wsRole === SPACE_ROLES.WORKSPACE_ADMIN) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      throw new ForbiddenException(
        'You do not have permission to delete this message',
      );
    }

    // Do not overwrite message.content with English text so that FE can localize correctly
    message.deletedAt = new Date();
    await message.save();
  }

  async findById(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Message ID');
    }
    const message = await this.messageModel
      .findById(id)
      .populate('senderId', 'fullName avatar email')
      .exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    const [withReactions] = await this.populateReactions([message]);
    return withReactions;
  }
}
