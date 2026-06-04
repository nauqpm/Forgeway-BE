import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
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

import {
  AuthenticatedSocket,
  REALTIME_EVENT_TYPES,
  RoomBuilder,
} from './contracts';
import { JoinPageRoomDto } from './dto/join-page-room.dto';
import { JoinTaskRoomDto } from './dto/join-task-room.dto';
import { JoinWorkspaceRoomDto } from './dto/join-workspace-room.dto';
import { LeaveTaskRoomDto } from './dto/leave-task-room.dto';
import { PageUpdateDto } from './dto/page-update.dto';
import { PageCollabService } from './services/page-collab.service';
import { LeaveWorkspaceRoomDto } from './dto/leave-workspace-room.dto';
import { PresenceHeartbeatDto } from './dto/presence-heartbeat.dto';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './services/presence.service';
import { RoomManagerService } from './services/room-manager.service';
import { SocketAuthService } from './services/socket-auth.service';

const socketValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  pingInterval: 10_000,
  pingTimeout: 5_000,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly clientEventWindowMs = 10_000;
  private readonly clientEventLimit = 30;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly socketAuthService: SocketAuthService,
    private readonly roomManagerService: RoomManagerService,
    private readonly pageCollabService: PageCollabService,
    private readonly presenceService: PresenceService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.bindServer(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const user = await this.socketAuthService.authenticate(client);
      await client.join(RoomBuilder.user(user.userId));
      this.logger.debug(
        `Realtime client connected: ${client.id}, userId: ${user.userId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected realtime connection ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.socketAuthService.clearDisconnectTimer(client as AuthenticatedSocket);
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
  }

  @SubscribeMessage('workspace:join')
  @UsePipes(socketValidationPipe)
  async joinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinWorkspaceRoomDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    return this.roomManagerService.joinWorkspace(client, body);
  }

  @SubscribeMessage('workspace:leave')
  @UsePipes(socketValidationPipe)
  async leaveWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: LeaveWorkspaceRoomDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    return this.roomManagerService.leaveWorkspace(client, body);
  }

  @SubscribeMessage('task:join')
  @UsePipes(socketValidationPipe)
  async joinTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinTaskRoomDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    return this.roomManagerService.joinTask(client, body);
  }

  @SubscribeMessage('task:leave')
  @UsePipes(socketValidationPipe)
  async leaveTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: LeaveTaskRoomDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    return this.roomManagerService.leaveTask(client, body);
  }

  // ── Page collaboration events ─────────────────────────────

  @SubscribeMessage('page:join')
  @UsePipes(socketValidationPipe)
  async joinPage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinPageRoomDto,
  ): Promise<{ ok: boolean; draft?: string }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    await client.join(pageRoom);

    const draft = await this.pageCollabService.getDraft(body.pageId);
    return { ok: true, draft };
  }

  @SubscribeMessage('page:leave')
  @UsePipes(socketValidationPipe)
  async leavePage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinPageRoomDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    await client.leave(pageRoom);

    // Check if room is now empty and flush if so
    const roomSockets = await this.server.in(pageRoom).fetchSockets();
    await this.pageCollabService.flushDraftIfRoomEmpty(
      body.pageId,
      roomSockets.length,
    );

    return { ok: true };
  }

  @SubscribeMessage('page:update')
  @UsePipes(socketValidationPipe)
  async updatePage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: PageUpdateDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const user = client.data.user!;
    await this.pageCollabService.handleUpdate(
      user.userId,
      body.pageId,
      body.content,
    );

    // Broadcast to all OTHER clients in the page room (not the sender)
    const pageRoom = RoomBuilder.page(body.pageId);
    client.to(pageRoom).emit(REALTIME_EVENT_TYPES.PAGE_UPDATED, {
      pageId: body.pageId,
      content: body.content,
      editedBy: user.userId,
    });

    return { ok: true };
  }

  private consumeClientEvent(client: AuthenticatedSocket): boolean {
    if (!client.data.user) {
      return false;
    }

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
