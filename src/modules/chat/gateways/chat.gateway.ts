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
import { COOKIE_NAMES } from '../../auth/constants/cookie.constants';
import { ChatService } from '../services/chat.service';

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
    private readonly chatService: ChatService,
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

  @SubscribeMessage('chat:join_channel')
  async joinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.channelId) return { ok: false };

    const channel = await this.chatService.getChannelById(body.channelId);
    if (!channel) return { ok: false };

    if (channel.type === 'private') {
      const isMember = channel.members.some((m) => m.userId.toString() === userId);
      if (!isMember) return { ok: false, error: 'Forbidden' };
    }

    await client.join(`channel:${channel._id}`);
    return { ok: true, channelId: channel._id };
  }

  @SubscribeMessage('chat:join_default')
  async joinDefault(@ConnectedSocket() client: AuthenticatedSocket) {
    const defaultChannel = await this.chatService.getDefaultChannel();
    if (defaultChannel) {
      const room = `channel:${defaultChannel._id}`;
      await client.join(room);
      this.logger.debug(`User ${client.data.user?.userId} joined room: ${room}`);
      return { ok: true, channelId: defaultChannel._id };
    }
    return { ok: false };
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const body = Array.isArray(payload) ? payload[0] : payload;
    const userId = client.data.user?.userId;

    if (!userId || !body?.channelId || !body?.content) {
      return { ok: false, error: 'Invalid payload' };
    }

    const message = await this.chatService.saveMessage(userId, body.channelId, body.content);
    const room = `channel:${body.channelId}`;
    
    this.server.to(room).emit('chat:message_received', message);
    
    return { ok: true };
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
