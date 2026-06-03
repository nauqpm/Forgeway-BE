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
  namespace: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL,
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

      client.data.user = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      
      this.logger.debug(`Chat client connected: ${client.id} (User: ${client.data.user?.userId})`);
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

    // Basic permission check
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
      await client.join(`channel:${defaultChannel._id}`);
      return { ok: true, channelId: defaultChannel._id };
    }
    return { ok: false };
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channelId: string; content: string },
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !body.channelId || !body.content) {
      return { ok: false };
    }

    const message = await this.chatService.saveMessage(userId, body.channelId, body.content);
    
    // Emit to everyone in the room
    this.server.to(`channel:${body.channelId}`).emit('chat:message_received', message);
    
    return { ok: true };
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    const cookies = parse(client.handshake.headers.cookie ?? '');
    return cookies[COOKIE_NAMES.ACCESS];
  }
}
