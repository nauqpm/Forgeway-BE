import {
  Inject,
  forwardRef,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageDocument } from '../schemas/message.schema';
import { MessagesRepository } from '../repositories/messages.repository';
import { ChannelReadMarkersRepository } from '../repositories/channel-read-markers.repository';
import { ChannelsService } from './channels.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';
import { UsersService } from '../../users/services/users.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RealtimeEnvelope } from '../../realtime/contracts';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly readMarkersRepository: ChannelReadMarkersRepository,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => WorkspaceMemberService))
    private readonly workspaceMemberService: WorkspaceMemberService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  private async parseMentionedIds(
    content: string,
    workspaceId: string,
    channelId?: string,
  ): Promise<string[]> {
    if (!content || !workspaceId) return [];

    try {
      const workspaceMembers = await this.workspaceMemberService.getMembers(
        workspaceId.toString(),
      );
      const nameToUserId = new Map<string, string>();
      for (const member of workspaceMembers) {
        const userDoc = member.userId;
        if (!userDoc) continue;
        const fullName = (userDoc.fullName || userDoc.name || '')
          .toString()
          .toLowerCase()
          .trim();
        if (fullName) {
          nameToUserId.set(fullName, (userDoc._id || userDoc).toString());
        }
      }

      const extractMentionedNames = (text: string): string[] => {
        const MENTION_REGEX =
          /@((?:\p{L}['\-\p{L}]*)+(?:\s+(?:\p{L}['\-\p{L}]*)+)*)/gu;
        const names: string[] = [];
        let match: RegExpExecArray | null;
        const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
        while ((match = regex.exec(text)) !== null) {
          const name = match[1].trim();
          if (name.length > 0) {
            names.push(name);
          }
        }
        return names;
      };

      const mentionedNames = extractMentionedNames(content);
      const mentionedIds: string[] = [];
      let mentionAll = false;

      for (const name of mentionedNames) {
        const lowerName = name.toLowerCase().trim();
        if (lowerName === 'all') {
          mentionAll = true;
          continue;
        }
        const uId = nameToUserId.get(lowerName);
        if (uId && !mentionedIds.includes(uId)) {
          mentionedIds.push(uId);
        }
      }

      if (mentionAll && channelId) {
        const channelMemberIds =
          await this.channelsService.getChannelMemberIds(channelId);
        for (const memberId of channelMemberIds) {
          if (memberId && !mentionedIds.includes(memberId)) {
            mentionedIds.push(memberId);
          }
        }
      }

      return mentionedIds;
    } catch (e) {
      this.logger.warn(`Failed to parse mentions: ${e.message}`);
      return [];
    }
  }

  async countUnread(channelId: string, userId: string): Promise<number> {
    const marker = await this.readMarkersRepository.model.findOne({
      channelId: new Types.ObjectId(channelId),
      userId: new Types.ObjectId(userId),
    });

    const lastReadAt = marker?.lastReadAt || new Date(0);

    return this.messagesRepository.model.countDocuments({
      channelId: new Types.ObjectId(channelId),
      senderId: { $ne: new Types.ObjectId(userId) },
      createdAt: { $gt: lastReadAt },
      deletedAt: null,
    });
  }

  async getReactions(messageId: string): Promise<Record<string, string[]>> {
    const message = await this.messagesRepository.findById(messageId);
    if (!message) return {};

    const result: Record<string, string[]> = {};
    if (message.reactions) {
      const allUserIds = new Set<string>();
      for (const userIds of message.reactions.values()) {
        userIds.forEach(id => allUserIds.add(id.toString()));
      }

      if (allUserIds.size === 0) return {};

      const validUsers = await this.usersService.getUsersByIds(Array.from(allUserIds));
      const validUserIdsSet = new Set(validUsers.map(u => u._id.toString()));

      for (const [emoji, userIds] of message.reactions.entries()) {
        const filtered = userIds
          .map(id => id.toString())
          .filter(idStr => validUserIdsSet.has(idStr));
        if (filtered.length > 0) {
          result[emoji] = filtered;
        }
      }
    }
    return result;
  }

  async populateReactions(messages: MessageDocument[]): Promise<any[]> {
    const allUserIds = new Set<string>();
    messages.forEach(m => {
      if (m.reactions) {
        for (const userIds of m.reactions.values()) {
          userIds.forEach(id => allUserIds.add(id.toString()));
        }
      }
      if (m.lastReplyParticipants) {
        m.lastReplyParticipants.forEach(p => {
          if (p && p.userId) {
            allUserIds.add(p.userId.toString());
          }
        });
      }
    });

    if (allUserIds.size === 0) {
      return messages.map(m => {
        const obj = m.toObject();
        obj.reactions = {};
        return obj;
      });
    }

    const validUsers = await this.usersService.getUsersByIds(Array.from(allUserIds));
    const validUserIdsSet = new Set(validUsers.map(u => u._id.toString()));

    return messages.map(m => {
      const obj = m.toObject();
      const reactionsRecord: Record<string, string[]> = {};
      if (m.reactions) {
        for (const [emoji, userIds] of m.reactions.entries()) {
          const filtered = userIds
            .map(id => id.toString())
            .filter(idStr => validUserIdsSet.has(idStr));
          if (filtered.length > 0) {
            reactionsRecord[emoji] = filtered;
          }
        }
      }
      obj.reactions = reactionsRecord;

      if (m.lastReplyParticipants) {
        obj.lastReplyParticipants = m.lastReplyParticipants.filter(p =>
          p && p.userId && validUserIdsSet.has(p.userId.toString())
        );
      }

      return obj;
    });
  }

  async markAsRead(channelId: string, userId: string): Promise<void> {
    await this.readMarkersRepository.model.updateOne(
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

    const message = await this.messagesRepository.findById(messageId);
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
      const parentMessage = await this.messagesRepository.findById(
        dto.replyToId,
      );
      if (!parentMessage || parentMessage.channelId.toString() !== channelId) {
        throw new ForbiddenException(
          'Cannot reply to message in a different channel',
        );
      }
    }

    let parentMessage: any = null;
    if (dto.threadParentId) {
      if (!Types.ObjectId.isValid(dto.threadParentId)) {
        throw new NotFoundException('Invalid threadParentId');
      }
      parentMessage = await this.messagesRepository.findById(
        dto.threadParentId,
      );
      if (!parentMessage) {
        throw new NotFoundException('Parent message not found');
      }
      if (parentMessage.channelId.toString() !== channelId) {
        throw new ForbiddenException(
          'Cannot reply to message in a different channel',
        );
      }
      if (parentMessage.threadParentId) {
        throw new ForbiddenException('Cannot reply to a reply message');
      }
    }

    const message = await this.messagesRepository.create({
      ...dto,
      channelId: new Types.ObjectId(channelId),
      senderId: new Types.ObjectId(senderId),
      threadParentId: dto.threadParentId
        ? new Types.ObjectId(dto.threadParentId)
        : null,
    });

    const populated = await message.populate([
      { path: 'senderId', select: 'fullName avatar email' },
      { path: 'stickerId' },
      {
        path: 'replyToId',
        populate: [
          { path: 'senderId', select: 'fullName avatar email' },
          { path: 'stickerId' },
        ],
      },
    ]);
    const [withReactions] = await this.populateReactions([populated]);

    if (dto.threadParentId && parentMessage) {
      const sender = await this.usersService.getUserById(senderId);
      const senderName = sender?.fullName || 'User';
      const senderAvatar = sender?.avatar || null;

      // 1. Update the parent message atomically
      await this.messagesRepository.model.updateOne(
        { _id: parentMessage._id },
        {
          $pull: {
            lastReplyParticipants: { userId: new Types.ObjectId(senderId) },
          },
        },
      );

      await this.messagesRepository.model.updateOne(
        { _id: parentMessage._id },
        {
          $push: {
            lastReplyParticipants: {
              $each: [
                {
                  userId: new Types.ObjectId(senderId),
                  fullName: senderName,
                  avatar: senderAvatar,
                },
              ],
              $slice: -3,
            },
          },
          $inc: { replyCount: 1 },
          $set: { lastReplyAt: new Date() },
        },
      );

      // 2. Emit CHAT_THREAD_REPLY_CREATED realtime socket event
      const room = RoomBuilder.channel(channelId);
      const envelope: RealtimeEnvelope<any> = {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.CHAT_THREAD_REPLY_CREATED,
        data: withReactions,
        occurredAt: new Date().toISOString(),
      };
      this.realtimePublisher.emit(room, envelope, 'chat');

      // 3. Send notifications (Only for mentioned users)
      if (channel.workspaceId && dto.content) {
        const mentionedIds = await this.parseMentionedIds(
          dto.content,
          channel.workspaceId.toString(),
          channelId,
        );
        if (mentionedIds.length > 0) {
          await this.notificationsService.notifyThreadReply({
            recipientIds: mentionedIds,
            actorId: senderId,
            workspaceId: channel.workspaceId.toString(),
            channelId,
            messageId: withReactions._id.toString(),
            parentId: parentMessage._id.toString(),
            parentContent: parentMessage.content || '',
            replyContent: dto.content || '',
            senderName,
          });
        }
      }
    } else {
      // 3. Send notifications for normal message mentions
      if (channel.workspaceId && dto.content) {
        const mentionedIds = await this.parseMentionedIds(
          dto.content,
          channel.workspaceId.toString(),
          channelId,
        );
        if (mentionedIds.length > 0) {
          const sender = await this.usersService.getUserById(senderId);
          const senderName = sender?.fullName || 'User';
          await this.notificationsService.notifyChatMentioned({
            recipientIds: mentionedIds,
            actorId: senderId,
            workspaceId: channel.workspaceId.toString(),
            channelId,
            messageId: withReactions._id.toString(),
            content: dto.content || '',
            senderName,
          });
        }
      }
    }

    return withReactions;
  }

  async findThreadReplies(
    channelId: string,
    parentMessageId: string,
    userId: string,
  ): Promise<any[]> {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('Invalid Channel ID');
    }
    if (!Types.ObjectId.isValid(parentMessageId)) {
      throw new NotFoundException('Invalid Parent Message ID');
    }

    const hasAccess = await this.channelsService.validateUserAccess(
      channelId,
      userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const parentMessage =
      await this.messagesRepository.findById(parentMessageId);
    if (!parentMessage || parentMessage.channelId.toString() !== channelId) {
      throw new NotFoundException('Parent message not found in this channel');
    }

    const replies = await this.messagesRepository.model
      .find({
        channelId: new Types.ObjectId(channelId),
        threadParentId: new Types.ObjectId(parentMessageId),
        deletedAt: null,
      })
      .sort({ createdAt: 1 })
      .populate([
        { path: 'senderId', select: 'fullName avatar email' },
        { path: 'stickerId' },
      ])
      .exec();

    return this.populateReactions(replies);
  }

  async findActiveThreads(channelId: string, userId: string): Promise<any[]> {
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

    const threads = await this.messagesRepository.model
      .find({
        channelId: new Types.ObjectId(channelId),
        threadParentId: null,
        replyCount: { $gt: 0 },
        deletedAt: null,
      })
      .sort({ lastReplyAt: -1 })
      .populate([
        { path: 'senderId', select: 'fullName avatar email' },
        { path: 'stickerId' },
      ])
      .exec();

    return this.populateReactions(threads);
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
    const query: any = {
      channelId: new Types.ObjectId(channelId),
      threadParentId: null,
    };

    if (dto.cursor) {
      if (!Types.ObjectId.isValid(dto.cursor)) {
        throw new NotFoundException('Invalid cursor');
      }
      query._id = { $lt: new Types.ObjectId(dto.cursor) };
    }

    const messages = await this.messagesRepository.model
      .find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .populate([
        { path: 'senderId', select: 'fullName avatar email' },
        { path: 'stickerId' },
        {
          path: 'replyToId',
          populate: [
            { path: 'senderId', select: 'fullName avatar email' },
            { path: 'stickerId' },
          ],
        },
      ])
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

    const message = await this.messagesRepository.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('Only the sender can edit this message');
    }

    message.content = content;
    message.editedAt = new Date();
    await message.save();

    const populated = await message.populate([
      { path: 'senderId', select: 'fullName avatar email' },
      { path: 'stickerId' },
      {
        path: 'replyToId',
        populate: [
          { path: 'senderId', select: 'fullName avatar email' },
          { path: 'stickerId' },
        ],
      },
    ]);
    const [withReactions] = await this.populateReactions([populated]);
    return withReactions;
  }

  async softDelete(
    messageId: string,
    userId: string,
  ): Promise<{ updatedLastMessage: any | null }> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Invalid Message ID');
    }

    const message = await this.messagesRepository.findById(messageId);
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

    // Check if this was the channel's last message and update it
    let updatedLastMessage: any = null;
    const channelId = message.channelId.toString();

    // Find the latest non-deleted message in this channel
    const previousMessage = await this.messagesRepository.model
      .findOne({
        channelId: new Types.ObjectId(channelId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .populate('senderId', 'fullName avatar email')
      .exec();

    if (previousMessage) {
      const senderName = (previousMessage.senderId as any)?.fullName || 'User';
      const sentAt = (previousMessage as any).createdAt || new Date();
      await this.channelsService.updateLastMessage(channelId, {
        content: previousMessage.content,
        senderId: previousMessage.senderId,
        senderName,
        sentAt,
        type: previousMessage.type,
      });
      updatedLastMessage = {
        content: previousMessage.content,
        senderId: previousMessage.senderId,
        senderName,
        sentAt,
        type: previousMessage.type,
      };
    } else {
      // No messages left, clear lastMessage
      await this.channelsService.updateLastMessage(channelId, {
        content: '',
        senderId: null,
        senderName: '',
        sentAt: new Date(),
        type: undefined,
      });
      updatedLastMessage = null;
    }

    return { updatedLastMessage };
  }

  async findById(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Message ID');
    }
    const message = await this.messagesRepository.model
      .findById(id)
      .populate([
        { path: 'senderId', select: 'fullName avatar email' },
        { path: 'stickerId' },
        {
          path: 'replyToId',
          populate: [
            { path: 'senderId', select: 'fullName avatar email' },
            { path: 'stickerId' },
          ],
        },
      ])
      .exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    const [withReactions] = await this.populateReactions([message]);
    return withReactions;
  }
}
