import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Server } from 'socket.io';
import { Types } from 'mongoose';
import { ChannelsService } from '../services/channels.service';
import { MessagesService } from '../services/messages.service';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RealtimeEnvelope } from '../../realtime/contracts/realtime-envelope.interface';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { SocketThrottlerGuard } from '../../../common/guards/socket-throttler.guard';
import { SocketAuthService } from '../../realtime/services/socket-auth.service';
import { AuthenticatedSocket } from '../../realtime/contracts/authenticated-socket.interface';
import { CHAT_THROTTLE_CONFIG } from '../constants/chat-throttler.constants';

@UseGuards(SocketThrottlerGuard)
@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly socketAuthService: SocketAuthService,
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
  ) {}

  afterInit(server: Server) {
    server.use(async (client: AuthenticatedSocket, next) => {
      try {
        await this.socketAuthService.authenticate(client);
        next();
      } catch (error) {
        next(new Error((error as Error).message));
      }
    });
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const user = client.data.user;
      if (!user) {
        client.disconnect(true);
        return;
      }
      const userIdentifier = user.email
        ? `${user.email} (${user.userId})`
        : user.userId;

      // Join personal room
      await client.join(RoomBuilder.user(user.userId));

      this.logger.log(
        `Chat client connected: ${client.id} | User: ${userIdentifier}`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected chat connection ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    try {
      const userId = client.data?.user?.userId;
      if (!userId) return;

      this.logger.log(
        `Chat client disconnected: ${client.id} | User: ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error in handleDisconnect for ${client.id}: ${(error as Error).message}`,
      );
    }
  }

  // 5.1 Room Management
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  @SubscribeMessage('chat.join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId?: string; channelIds?: string[] },
  ) {
    const userId = client.data.user?.userId;
    if (!userId) return { ok: false };

    // Batch join
    if (body.channelIds && Array.isArray(body.channelIds)) {
      const results: { channelId: string; ok: boolean; error?: string }[] = [];
      for (const channelId of body.channelIds) {
        if (!channelId) continue;
        try {
          const hasAccess = await this.channelsService.validateUserAccess(
            channelId,
            userId,
          );
          if (!hasAccess) {
            results.push({ channelId, ok: false, error: 'Forbidden' });
            continue;
          }
          await client.join(RoomBuilder.channel(channelId));
          client.emit('chat.joined', { channelId, userId });
          results.push({ channelId, ok: true });
        } catch (err) {
          results.push({ channelId, ok: false, error: (err as Error).message });
        }
      }
      return { ok: true, results };
    }

    // Single join
    if (body.channelId) {
      const hasAccess = await this.channelsService.validateUserAccess(
        body.channelId,
        userId,
      );
      if (!hasAccess) return { ok: false, error: 'Forbidden' };

      await client.join(RoomBuilder.channel(body.channelId));
      client.emit('chat.joined', { channelId: body.channelId, userId });
      return { ok: true };
    }

    return { ok: false, error: 'No channelId or channelIds provided' };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  @SubscribeMessage('chat.leave')
  async handleLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    if (!body.channelId) return;
    await client.leave(RoomBuilder.channel(body.channelId));
  }

  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_SEND)
  @SubscribeMessage('chat.send')
  async handleSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.channelId) return { ok: false };

    const message = await this.messagesService.send(
      payload.channelId,
      userId,
      payload,
    );

    if (payload.threadParentId) {
      return { ok: true };
    }

    // Update last message preview in channel
    await this.messagesService.updateChannelLastMessageIfNeeded(
      payload.channelId,
      message,
    );

    const room = RoomBuilder.channel(payload.channelId);

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_SENT,
      data: message,
      occurredAt: new Date().toISOString(),
    };

    this.server.to(room).emit(REALTIME_EVENT_TYPES.CHAT_MESSAGE_SENT, envelope);

    // Update unread count to all other channel members
    try {
      const memberIds = await this.channelsService.getChannelMemberIds(
        payload.channelId,
      );
      for (const memberId of memberIds) {
        if (memberId === userId) continue;

        this.server
          .to(RoomBuilder.user(memberId))
          .emit(REALTIME_EVENT_TYPES.CHAT_UNREAD_UPDATE, {
            channelId: payload.channelId,
            increment: 1,
            lastMessage: message,
          });
      }
    } catch (err) {
      this.logger.error(
        `Failed to broadcast unread updates: ${err.message}`,
        err.stack,
      );
    }

    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  @SubscribeMessage('chat.edit')
  async handleEdit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: { messageId: string; channelId: string; content: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.messageId) return { ok: false };

    const message = await this.messagesService.edit(
      payload.messageId,
      userId,
      payload.content,
    );

    // Update last message preview in channel if this was the last message
    await this.messagesService.updateChannelLastMessageIfNeeded(
      payload.channelId,
      message,
    );

    const room = RoomBuilder.channel(payload.channelId);

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_EDITED,
      data: message,
      occurredAt: new Date().toISOString(),
    };

    this.server
      .to(room)
      .emit(REALTIME_EVENT_TYPES.CHAT_MESSAGE_EDITED, envelope);
    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  @SubscribeMessage('chat.delete')
  async handleDelete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string; channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.messageId) return { ok: false };

    const { updatedLastMessage } = await this.messagesService.softDelete(
      payload.messageId,
      userId,
    );
    const room = RoomBuilder.channel(payload.channelId);

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_DELETED,
      data: {
        messageId: payload.messageId,
        channelId: payload.channelId,
        lastMessage: updatedLastMessage || undefined,
      },
      occurredAt: new Date().toISOString(),
    };

    this.server
      .to(room)
      .emit(REALTIME_EVENT_TYPES.CHAT_MESSAGE_DELETED, envelope);
    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.REACTION)
  @SubscribeMessage('chat.reaction')
  async handleReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: { messageId: string; emoji: string; channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.messageId || !payload.emoji) return { ok: false };

    // Persist reaction into the database
    await this.messagesService.toggleReaction(
      payload.messageId,
      userId,
      payload.emoji,
    );
    // Get updated reactions map for the message
    const updatedReactions = await this.messagesService.getReactions(
      payload.messageId,
    );

    const room = RoomBuilder.channel(payload.channelId);
    this.server.to(room).emit(REALTIME_EVENT_TYPES.CHAT_REACTION_UPDATED, {
      messageId: payload.messageId,
      channelId: payload.channelId,
      reactions: updatedReactions,
    });

    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  @SubscribeMessage('chat.mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.channelId) return { ok: false };

    await this.channelsService.markAsRead(body.channelId, userId);

    // Notify all other connections/tabs of this user that the channel unread count is now 0
    this.server
      .to(RoomBuilder.user(userId))
      .emit(REALTIME_EVENT_TYPES.CHAT_UNREAD_UPDATE, {
        channelId: body.channelId,
        unreadCount: 0,
      });

    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.TYPING)
  @SubscribeMessage('chat.typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = client.data.user;
    if (!user || !body.channelId) return;

    const room = RoomBuilder.channel(body.channelId);
    client.to(room).emit(REALTIME_EVENT_TYPES.CHAT_USER_TYPING, {
      userId: user.userId,
      channelId: body.channelId,
      timestamp: new Date().toISOString(),
    });
  }
}
