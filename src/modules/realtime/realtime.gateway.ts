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
import { PageYjsUpdateDto } from './dto/page-yjs-update.dto';
import { PageCollabService } from './services/page-collab.service';
import { LeaveWorkspaceRoomDto } from './dto/leave-workspace-room.dto';
import { PresenceHeartbeatDto } from './dto/presence-heartbeat.dto';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './services/presence.service';
import { RoomManagerService } from './services/room-manager.service';
import { SocketAuthService } from './services/socket-auth.service';
import { PageDraft } from '../pages/schemas/page-draft.schema';
import { Page } from '../pages/schemas/page.schema';
import { PagePublishDto } from './dto/page-publish.dto';
import { LeavePageRoomDto } from './dto/leave-page-room.dto';

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
      const userIdentifier = user.email ? `${user.email} (${user.userId})` : user.userId;
      this.logger.debug(
        `Realtime client connected: ${client.id} | User: ${userIdentifier}`,
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

  // page-collab
  // ── Page collaboration (Yjs CRDT) ──────────────────────────────

  /**
   * page:join — client enters edit mode for a page.
   * Returns full Yjs state so the client can bootstrap its Y.Doc.
   */
  @SubscribeMessage('page:join')
  @UsePipes(socketValidationPipe)
  async joinPage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinPageRoomDto,
  ): Promise<{
    ok: boolean;
    yjsState?: number[];
    stateVector?: number[];
    title?: string;
  }> {
    if (!this.consumeClientEvent(client)) return { ok: false };

    const pageRoom = RoomBuilder.page(body.pageId);
    await client.join(pageRoom);

    const state = await this.pageCollabService.getYjsState(body.pageId);
    return { ok: true, ...state };
  }

  /**
   * page:leave — client exits edit mode.
   * Schedules memory eviction when the room becomes empty.
   */
  @SubscribeMessage('page:leave')
  @UsePipes(socketValidationPipe)
  async leavePage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: LeavePageRoomDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) return { ok: false };

    const pageRoom = RoomBuilder.page(body.pageId);
    await client.leave(pageRoom);

    const remaining = await this.server.in(pageRoom).fetchSockets();
    if (remaining.length === 0) {
      // Room is empty — schedule timed eviction (not immediate, to handle
      // fast page-reloads gracefully)
      this.pageCollabService.scheduleRoomEmpty(body.pageId);
    }

    return { ok: true };
  }

  /**
   * page:yjs-update — incremental Yjs update from one client.
   * Applies to server Y.Doc then relays to all other room members.
   *
   * NOTE: @UsePipes is intentionally omitted here.
   * The update field is a raw number[] that cannot be validated by
   * class-validator without custom logic. We validate size manually
   * inside PageCollabService.applyUpdate().
   */
  @SubscribeMessage('page:yjs-update')
  async handleYjsUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: PageYjsUpdateDto,
  ): Promise<{ ok: boolean }> {
    const user = client.data.user;
    if (!user) return { ok: false };

    if (!body.update?.length) {
      this.logger.warn(
        `Empty yjs-update from ${user.userId} for page ${body.pageId}`,
      );
      return { ok: false };
    }

    try {
      await this.pageCollabService.applyUpdate(
        body.pageId,
        new Uint8Array(body.update),
        user.userId,
      );
    } catch {
      // applyUpdate already logs the error; do NOT relay corrupted bytes
      return { ok: false };
    }

    // Relay raw bytes to all OTHER clients in the page room
    client
      .to(RoomBuilder.page(body.pageId))
      .emit(REALTIME_EVENT_TYPES.PAGE_YJS_UPDATE, {
        pageId: body.pageId,
        update: body.update,
      });

    return { ok: true };
  }

  /**
   * page:publish — flush current draft to the main Page document.
   * Called when the user clicks the "Cập nhật" button.
   */
  @SubscribeMessage('page:publish')
  @UsePipes(socketValidationPipe)
  async publishPage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: PagePublishDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) return { ok: false };

    const user = client.data.user;
    if (!user) return { ok: false };

    try {
      await this.pageCollabService.publishToPage(body.pageId, user.userId);
    } catch (err) {
      this.logger.error(
        `publishPage failed for ${body.pageId}: ${(err as Error).message}`,
      );
      return { ok: false };
    }

    return { ok: true };
  }

  // end-page-colab

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
