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
import { PageYjsUpdateDto } from './dto/page-yjs-update.dto';
import { PageAwarenessUpdateDto } from './dto/page-awareness-update.dto';
import { PageCollabService } from './services/page-collab.service';
import { LeaveWorkspaceRoomDto } from './dto/leave-workspace-room.dto';
import { PresenceHeartbeatDto } from './dto/presence-heartbeat.dto';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './services/presence.service';
import { RoomManagerService } from './services/room-manager.service';
import { SocketAuthService } from './services/socket-auth.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WsException } from '@nestjs/websockets';
import { PagesService } from '../pages/services/pages.service';
import { Workspace, WorkspaceDocument } from '../workspaces/schemas/workspace.schema';
import { getPermissionsForWorkspaceRole } from '../../common/constants/workspace-permissions.constants';

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
    private readonly pagesService: PagesService,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
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
  ): Promise<{ ok: boolean; yjsState?: number[]; title?: string; content?: string }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const user = client.data.user!;
    const isAllowed = await this.authorizePageRead(user.userId, body.pageId);
    if (!isAllowed) {
      throw new WsException('Forbidden: You do not have permission to access this page');
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    await client.join(pageRoom);

    const page = await this.pagesService.findById(body.pageId);
    if (!page) {
      return { ok: false };
    }

    return {
      ok: true,
      yjsState: page.yjsState ? Array.from(new Uint8Array(page.yjsState)) : undefined,
      title: page.title,
      content: page.content,
    };
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
    const isAllowed = await this.authorizePageEdit(user.userId, body.pageId);
    if (!isAllowed) {
      throw new WsException('Forbidden: You do not have permission to edit this page');
    }

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

  @SubscribeMessage('page:yjs-update')
  @UsePipes(socketValidationPipe)
  async handlePageYjsUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: PageYjsUpdateDto,
  ): Promise<{ ok: boolean; updateId?: string }> {
    if (!this.consumeClientEvent(client)) {
      return { ok: false };
    }

    const user = client.data.user!;
    const isAllowed = await this.authorizePageEdit(user.userId, body.pageId);
    if (!isAllowed) {
      throw new WsException('Forbidden: You do not have permission to edit this page');
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    client.to(pageRoom).emit('page.yjs-update', {
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
      throw new WsException('Forbidden: You do not have permission to access this page');
    }

    const pageRoom = RoomBuilder.page(body.pageId);
    client.to(pageRoom).emit('page.awareness-update', {
      pageId: body.pageId,
      update: body.update,
    });

    return { ok: true };
  }

  private async authorizePageEdit(userId: string, pageId: string): Promise<boolean> {
    try {
      const page = await this.pagesService.findById(pageId);
      if (!page) return false;

      const workspace = await this.workspaceModel.findById(page.workspaceId).exec();
      if (!workspace) return false;

      const member = workspace.members.find(
        (m) => m.userId.toString() === userId,
      );
      const role =
        workspace.ownerId.toString() === userId
          ? 'admin'
          : member?.role;

      if (!role) return false;

      const permissions = getPermissionsForWorkspaceRole(role as any);
      return permissions.includes('page:edit');
    } catch {
      return false;
    }
  }

  private async authorizePageRead(userId: string, pageId: string): Promise<boolean> {
    try {
      const page = await this.pagesService.findById(pageId);
      if (!page) return false;

      const workspace = await this.workspaceModel.findById(page.workspaceId).exec();
      if (!workspace) return false;

      if (workspace.ownerId.toString() === userId) {
        return true;
      }

      const member = workspace.members.find(
        (m) => m.userId.toString() === userId,
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
