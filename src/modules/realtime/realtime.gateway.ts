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
import { PageAwarenessUpdateDto } from './dto/page-awareness-update.dto';
import { PageCollabService } from './services/page-collab.service';
import { LeaveWorkspaceRoomDto } from './dto/leave-workspace-room.dto';
import { PresenceSubscribeDto } from './dto/presence-subscribe.dto';
import { RealtimeService } from './realtime.service';
import { RoomManagerService } from './services/room-manager.service';
import { SocketAuthService } from './services/socket-auth.service';
import { PresenceService } from '../presence/services/presence.service';
import {
  PresenceQueryService,
  PresenceEntry,
} from '../presence/services/presence-query.service';
import { PresenceConfig } from '../presence/presence.config';
import { PresenceKeys } from '../presence/presence.constants';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WsException } from '@nestjs/websockets';
import { PagesService } from '../pages/services/pages.service';
import {
  Workspace,
  WorkspaceDocument,
} from '../workspaces/schemas/workspace.schema';
import { getPermissionsForWorkspaceRole } from '../../common/constants/workspace-permissions.constants';
import { LeavePageRoomDto } from './dto/leave-page-room.dto';
import { getAllowedCorsOrigins } from '../../config/cors-origins.config';

const socketValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: getAllowedCorsOrigins(),
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
    private readonly pagesService: PagesService,
    private readonly presenceService: PresenceService,
    private readonly presenceQueryService: PresenceQueryService,
    private readonly presenceConfig: PresenceConfig,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.bindServer(server);
    this.presenceService.bindServer(server);
    server.use(async (socket: AuthenticatedSocket, next) => {
      try {
        await this.socketAuthService.authenticate(socket);
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

      client.data.presenceWatchCount = 0;
      await client.join(RoomBuilder.user(user.userId));
      await this.presenceService.registerConnection(user.userId, client.id);
      const userIdentifier = user.email
        ? `${user.email} (${user.userId})`
        : user.userId;
      this.logger.log(
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
    const authClient = client as AuthenticatedSocket;
    this.socketAuthService.clearDisconnectTimer(authClient);
    const user = authClient.data?.user;
    const userIdentifier = user?.email
      ? ` | User: ${user.email} (${user.userId})`
      : user?.userId
        ? ` | User: ${user.userId}`
        : '';
    this.logger.log(
      `Realtime client disconnected: ${client.id}${userIdentifier}`,
    );
    if (user?.userId) {
      void this.presenceService.registerDisconnection(user.userId, client.id);
    }
  }

  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ ok: boolean }> {
    const user = client.data.user;
    if (!user) return { ok: false };
    await this.presenceService.heartbeat(user.userId, client.id);
    return { ok: true };
  }

  @SubscribeMessage('presence:subscribe')
  @UsePipes(socketValidationPipe)
  async handlePresenceSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: PresenceSubscribeDto,
  ): Promise<
    | { subscribed: string[]; currentStatuses: PresenceEntry[] }
    | { error: string }
  > {
    if (!this.consumeClientEvent(client)) {
      return { error: 'Rate limit exceeded' };
    }

    const maxSubscriptions = this.presenceConfig.maxSubscriptions;
    const currentCount = client.data.presenceWatchCount ?? 0;

    const newIds = Array.from(new Set(dto.userIds));
    let addedCount = 0;
    const subscribed: string[] = [];

    for (const id of newIds) {
      const room = PresenceKeys.watchRoom(id);
      if (!client.rooms.has(room)) {
        if (currentCount + addedCount >= maxSubscriptions) {
          break;
        }
        client.join(room);
        addedCount++;
      }
      subscribed.push(id);
    }

    client.data.presenceWatchCount = currentCount + addedCount;

    const viewerId = client.data.user!.userId;
    const currentStatuses = await this.presenceQueryService.getBatchPresence(
      subscribed,
      viewerId,
    );

    return { subscribed, currentStatuses };
  }

  @SubscribeMessage('presence:unsubscribe')
  @UsePipes(socketValidationPipe)
  async handlePresenceUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: PresenceSubscribeDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    let removedCount = 0;
    for (const id of dto.userIds) {
      const room = PresenceKeys.watchRoom(id);
      if (client.rooms.has(room)) {
        client.leave(room);
        removedCount++;
      }
    }

    if (client.data.presenceWatchCount !== undefined) {
      client.data.presenceWatchCount = Math.max(
        0,
        client.data.presenceWatchCount - removedCount,
      );
    }

    return { ok: true };
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
    title?: string;
    content?: string;
  }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const user = client.data.user!;
    const isAllowed = await this.authorizePageRead(user.userId, body.pageId);
    if (!isAllowed) {
      throw new WsException(
        'Forbidden: You do not have permission to access this page',
      );
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    await client.join(pageRoom);

    const page = await this.pagesService.findById(body.pageId);
    if (!page) {
      return { ok: false };
    }

    return {
      ok: true,
      yjsState: page.yjsState
        ? Array.from(new Uint8Array(page.yjsState))
        : undefined,
      title: page.title,
      content: page.content,
    };
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
  ): Promise<{ ok: boolean; updateId?: string }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const user = client.data.user;
    if (!user) {
      return { ok: false };
    }

    if (!body.update?.length) {
      this.logger.warn(
        `Empty yjs-update from ${user.userId} for page ${body.pageId}`,
      );
      return { ok: false };
    }
    const isAllowed = await this.authorizePageEdit(user.userId, body.pageId);
    if (!isAllowed) {
      throw new WsException(
        'Forbidden: You do not have permission to edit this page',
      );
    }

    await this.pageCollabService.applyUpdate(
      body.pageId,
      new Uint8Array(body.update),
      user.userId,
    );

    // Relay raw bytes to all OTHER clients in the page room
    client
      .to(RoomBuilder.page(body.pageId))
      .emit(REALTIME_EVENT_TYPES.PAGE_YJS_UPDATE, {
        pageId: body.pageId,
        update: body.update,
      });

    return { ok: true, updateId: body.updateId };
  }

  @SubscribeMessage('page:awareness-update')
  @UsePipes(socketValidationPipe)
  async handlePageAwarenessUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: PageAwarenessUpdateDto,
  ): Promise<{ ok: boolean }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const user = client.data.user!;
    const isAllowed = await this.authorizePageRead(user.userId, body.pageId);
    if (!isAllowed) {
      throw new WsException(
        'Forbidden: You do not have permission to access this page',
      );
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    client.to(pageRoom).emit('page.awareness-update', {
      pageId: body.pageId,
      update: body.update,
    });

    return { ok: true };
  }

  private async authorizePageEdit(
    userId: string,
    pageId: string,
  ): Promise<boolean> {
    try {
      const page = await this.pagesService.findById(pageId);
      if (!page) return false;

      const workspace = await this.workspaceModel
        .findById(page.workspaceId)
        .exec();
      if (!workspace) return false;

      const member = workspace.members.find(
        m => m.userId.toString() === userId,
      );
      const role =
        workspace.ownerId.toString() === userId ? 'admin' : member?.role;

      if (!role) return false;

      const permissions = getPermissionsForWorkspaceRole(role);
      return permissions.includes('page:edit');
    } catch {
      return false;
    }
  }

  private async authorizePageRead(
    userId: string,
    pageId: string,
  ): Promise<boolean> {
    try {
      const page = await this.pagesService.findById(pageId);
      if (!page) return false;

      const workspace = await this.workspaceModel
        .findById(page.workspaceId)
        .exec();
      if (!workspace) return false;

      if (workspace.ownerId.toString() === userId) {
        return true;
      }

      const member = workspace.members.find(
        m => m.userId.toString() === userId,
      );
      return !!member;
    } catch {
      return false;
    }
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
