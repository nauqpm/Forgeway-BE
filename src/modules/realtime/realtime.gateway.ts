import { Logger } from '@nestjs/common';
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
import { Server, Socket } from 'socket.io';

import { AuthenticatedSocket, RoomBuilder } from './contracts';
import { RealtimeService } from './realtime.service';
import { SocketAuthService } from './services/socket-auth.service';

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
    private readonly realtimeService: RealtimeService,
    private readonly socketAuthService: SocketAuthService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.bindServer(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const user = await this.socketAuthService.authenticate(client);
      await client.join(RoomBuilder.user(user.userId));
      this.logger.debug(`Realtime client connected: ${client.id}, userId: ${user.userId}`);
    } catch (error) {
      this.logger.warn(`Rejected realtime connection ${client.id}: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.socketAuthService.clearDisconnectTimer(client as AuthenticatedSocket);
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
