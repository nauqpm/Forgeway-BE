import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse } from 'cookie';
import { Server, Socket } from 'socket.io';
import { COOKIE_NAMES } from '../auth/constants/cookie.constants';
import { RealtimeService } from './realtime.service';

type AuthenticatedSocket = Socket & {
  data: {
    user?: {
      userId: string;
      email?: string;
      role?: string;
    };
    rateLimit?: {
      windowStartedAt: number;
      count: number;
    };
  };
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  pingInterval: 10_000,
  pingTimeout: 5_000,
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly clientEventWindowMs = 10_000;
  private readonly clientEventLimit = 30;

  constructor(
    private readonly jwtService: JwtService,
    private readonly realtimeService: RealtimeService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.bindServer(server);
  }

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
    } catch (error) {
      this.logger.warn(`Rejected realtime connection ${client.id}: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
  }

  @SubscribeMessage('workspace:join')
  async joinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client) || !body?.workspaceId) {
      return { ok: false };
    }

    await client.join(this.realtimeService.workspaceRoom(body.workspaceId));
    return { ok: true };
  }

  @SubscribeMessage('workspace:leave')
  async leaveWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client) || !body?.workspaceId) {
      return { ok: false };
    }

    await client.leave(this.realtimeService.workspaceRoom(body.workspaceId));
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

  private consumeClientEvent(client: AuthenticatedSocket): boolean {
    const now = Date.now();
    const current = client.data.rateLimit;

    if (!current || now - current.windowStartedAt > this.clientEventWindowMs) {
      client.data.rateLimit = { windowStartedAt: now, count: 1 };
      return true;
    }

    current.count += 1;
    if (current.count <= this.clientEventLimit) {
      return true;
    }

    client.emit('rate_limited', { retryAfterMs: this.clientEventWindowMs });
    return false;
  }
}
