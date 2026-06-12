import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
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
import { MeetingService } from '../services/meeting.service';
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
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly socketAuthService: SocketAuthService,
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
    private readonly meetingService: MeetingService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const user = await this.socketAuthService.authenticate(client);
      const userIdentifier = user.email ? `${user.email} (${user.userId})` : user.userId;
      
      // Join personal room
      await client.join(RoomBuilder.user(user.userId));

      this.logger.log(
        `Chat client connected: ${client.id} | User: ${userIdentifier}`,
      );
    } catch (error) {
      this.logger.warn(`Rejected chat connection ${client.id}: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  // 5.1 Room Management
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  @SubscribeMessage('chat.join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.channelId) return { ok: false };

    const hasAccess = await this.channelsService.validateUserAccess(body.channelId, userId);
    if (!hasAccess) return { ok: false, error: 'Forbidden' };

    await client.join(RoomBuilder.channel(body.channelId));
    client.emit('chat.joined', { channelId: body.channelId, userId });
    return { ok: true };
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

    const message = await this.messagesService.send(payload.channelId, userId, payload);
    
    // Update last message preview in channel
    await this.channelsService.updateLastMessage(payload.channelId, {
      content: message.content,
      senderId: userId,
      senderName: (message as any).senderId?.fullName || '',
      sentAt: (message as any).createdAt,
    });

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
      const memberIds = await this.channelsService.getChannelMemberIds(payload.channelId);
      for (const memberId of memberIds) {
        if (memberId === userId) continue;

        this.server.to(RoomBuilder.user(memberId)).emit(REALTIME_EVENT_TYPES.CHAT_UNREAD_UPDATE, {
          channelId: payload.channelId,
          increment: 1,
          lastMessage: message,
        });
      }
    } catch (err) {
      this.logger.error(`Failed to broadcast unread updates: ${err.message}`, err.stack);
    }

    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  @SubscribeMessage('chat.edit')
  async handleEdit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string; channelId: string; content: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.messageId) return { ok: false };

    const message = await this.messagesService.edit(payload.messageId, userId, payload.content);
    const room = RoomBuilder.channel(payload.channelId);

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_EDITED,
      data: message,
      occurredAt: new Date().toISOString(),
    };

    this.server.to(room).emit(REALTIME_EVENT_TYPES.CHAT_MESSAGE_EDITED, envelope);
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

    await this.messagesService.softDelete(payload.messageId, userId);
    const room = RoomBuilder.channel(payload.channelId);

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_DELETED,
      data: { messageId: payload.messageId, channelId: payload.channelId },
      occurredAt: new Date().toISOString(),
    };

    this.server.to(room).emit(REALTIME_EVENT_TYPES.CHAT_MESSAGE_DELETED, envelope);
    return { ok: true };
  }

  @SubscribeMessage('chat.reaction')
  async handleReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string; emoji: string; channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.messageId || !payload.emoji) return { ok: false };

    // Persist reaction into the database
    await this.messagesService.toggleReaction(payload.messageId, userId, payload.emoji);
    // Get updated reactions map for the message
    const updatedReactions = await this.messagesService.getReactions(payload.messageId);

    const room = RoomBuilder.channel(payload.channelId);
    this.server.to(room).emit(REALTIME_EVENT_TYPES.CHAT_REACTION_UPDATED, {
      messageId: payload.messageId,
      channelId: payload.channelId,
      reactions: updatedReactions,
    });

    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  @SubscribeMessage('chat.mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.channelId) return { ok: false };

    await this.channelsService.markAsRead(body.channelId, userId);
    
    // Notify all other connections/tabs of this user that the channel unread count is now 0
    this.server.to(RoomBuilder.user(userId)).emit(REALTIME_EVENT_TYPES.CHAT_UNREAD_UPDATE, {
      channelId: body.channelId,
      unreadCount: 0,
    });
    
    return { ok: true };
  }

  @Throttle(CHAT_THROTTLE_CONFIG.TYPING)
  @SubscribeMessage('chat.typing')
  async handleTyping(
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

  // 5.3 Meeting Events
  @SubscribeMessage('meeting.join')
  async handleMeetingJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.channelId) return { ok: false };

    let meeting = await this.meetingService.findActive(body.channelId);
    if (!meeting) {
      meeting = await this.meetingService.create(body.channelId, userId);
    } else {
      meeting = await this.meetingService.join(meeting._id.toString(), userId);
    }

    const meetingId = meeting._id.toString();
    await client.join(RoomBuilder.meeting(meetingId));

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.MEETING_USER_JOINED,
      data: { userId, meetingId, participants: meeting.participants },
      occurredAt: new Date().toISOString(),
    };

    this.server.to(RoomBuilder.meeting(meetingId)).emit(REALTIME_EVENT_TYPES.MEETING_USER_JOINED, envelope);
    return { ok: true, meetingId };
  }

  @SubscribeMessage('meeting.leave')
  async handleMeetingLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { meetingId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.meetingId) return { ok: false };

    const meeting = await this.meetingService.leave(body.meetingId, userId);
    await client.leave(RoomBuilder.meeting(body.meetingId));

    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.MEETING_USER_LEFT,
      data: { userId, meetingId: body.meetingId, participants: meeting.participants },
      occurredAt: new Date().toISOString(),
    };

    this.server.to(RoomBuilder.meeting(body.meetingId)).emit(REALTIME_EVENT_TYPES.MEETING_USER_LEFT, envelope);

    if (meeting.status === 'ended') {
      this.server.to(RoomBuilder.meeting(body.meetingId)).emit(REALTIME_EVENT_TYPES.MEETING_ENDED, { meetingId: body.meetingId });
    }

    return { ok: true };
  }

  @SubscribeMessage('meeting.toggle.audio')
  async handleToggleAudio(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { meetingId: string; isOn: boolean },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.meetingId) return;

    await this.meetingService.toggleAudio(body.meetingId, userId, body.isOn);
    
    this.server.to(RoomBuilder.meeting(body.meetingId)).emit(REALTIME_EVENT_TYPES.MEETING_USER_AUDIO_CHANGED, {
      userId,
      isOn: body.isOn,
    });
  }

  @SubscribeMessage('meeting.toggle.video')
  async handleToggleVideo(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { meetingId: string; isOn: boolean },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.meetingId) return;

    await this.meetingService.toggleVideo(body.meetingId, userId, body.isOn);
    
    this.server.to(RoomBuilder.meeting(body.meetingId)).emit(REALTIME_EVENT_TYPES.MEETING_USER_VIDEO_CHANGED, {
      userId,
      isOn: body.isOn,
    });
  }

  // 5.4 WebRTC Signaling
  @SubscribeMessage('rtc.offer')
  async handleRtcOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { meetingId: string; targetUserId: string; sdp: any },
  ) {
    const senderId = client.data.user?.userId;
    if (!senderId) return;

    this.server.to(RoomBuilder.user(payload.targetUserId)).emit(REALTIME_EVENT_TYPES.RTC_OFFER, {
      ...payload,
      senderId,
    });
  }

  @SubscribeMessage('rtc.answer')
  async handleRtcAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { meetingId: string; targetUserId: string; sdp: any },
  ) {
    const senderId = client.data.user?.userId;
    if (!senderId) return;

    this.server.to(RoomBuilder.user(payload.targetUserId)).emit(REALTIME_EVENT_TYPES.RTC_ANSWER, {
      ...payload,
      senderId,
    });
  }

  @SubscribeMessage('rtc.ice')
  async handleRtcIce(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { meetingId: string; targetUserId: string; candidate: any },
  ) {
    const senderId = client.data.user?.userId;
    if (!senderId) return;

    this.server.to(RoomBuilder.user(payload.targetUserId)).emit(REALTIME_EVENT_TYPES.RTC_ICE_CANDIDATE, {
      ...payload,
      senderId,
    });
  }
}
