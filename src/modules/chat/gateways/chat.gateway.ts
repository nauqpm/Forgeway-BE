import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { parse } from 'cookie';
import { Types } from 'mongoose';
import { COOKIE_NAMES } from '../../auth/constants/cookie.constants';
import { ChannelsService } from '../services/channels.service';
import { MessagesService } from '../services/messages.service';
import { MeetingService } from '../services/meeting.service';
import { MeetingDocument } from '../schemas/meeting.schema';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RealtimeEnvelope } from '../../realtime/contracts/realtime-envelope.interface';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';

type AuthenticatedSocket = Socket & {
  data: {
    user?: {
      userId: string;
      email?: string;
      role?: string;
    };
  };
};

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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
    private readonly meetingService: MeetingService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const decoded = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.data.user = decoded;
      
      this.logger.debug(`Chat client connected: ${client.id} (User: ${decoded.userId})`);
    } catch (error) {
      this.logger.warn(`Rejected chat connection ${client.id}: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  // 5.1 Room Management
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

  @SubscribeMessage('chat.leave')
  async handleLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    if (!body.channelId) return;
    await client.leave(RoomBuilder.channel(body.channelId));
  }

  // 5.2 Text Chat Events
  @SubscribeMessage('chat.send')
  async handleSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !payload.channelId) return { ok: false };

    const message = await this.messagesService.send(payload.channelId, userId, payload);
    const room = RoomBuilder.channel(payload.channelId);
    
    const envelope: RealtimeEnvelope<any> = {
      eventId: new Types.ObjectId().toString(),
      type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_SENT,
      data: message,
      occurredAt: new Date().toISOString(),
    };

    this.server.to(room).emit(REALTIME_EVENT_TYPES.CHAT_MESSAGE_SENT, envelope);
    return { ok: true };
  }

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

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice(7);
    }

    const cookies = parse(client.handshake.headers.cookie ?? '');
    return cookies[COOKIE_NAMES.ACCESS];
  }
}
