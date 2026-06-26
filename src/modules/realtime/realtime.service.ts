import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RoomBuilder } from './contracts';

export const BOARD_REALTIME_EVENTS = {
  BOARD_DELTA: 'board:delta',
} as const;

export type BoardDeltaAction =
  | 'board:columns-replaced'
  | 'column:created'
  | 'column:updated'
  | 'column:deleted'
  | 'column:moved'
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:moved';

export interface BoardDeltaPayload<TPayload = unknown> {
  workspaceId: string;
  action: BoardDeltaAction;
  payload: TPayload;
  version?: number;
  occurredAt: string;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;

  bindServer(server: Server): void {
    this.server = server;
  }

  getServer(): Server | undefined {
    return this.server;
  }

  emitBoardDelta<TPayload>(
    workspaceId: string,
    action: BoardDeltaAction,
    payload: TPayload,
    version?: number,
  ): void {
    if (!this.server) {
      return;
    }

    const delta: BoardDeltaPayload<TPayload> = {
      workspaceId,
      action,
      payload,
      version,
      occurredAt: new Date().toISOString(),
    };

    this.server
      .to(this.workspaceRoom(workspaceId))
      .emit(BOARD_REALTIME_EVENTS.BOARD_DELTA, delta);
  }

  workspaceRoom(workspaceId: string): string {
    return RoomBuilder.workspace(workspaceId);
  }

  emitPageVersionRestored(
    pageId: string,
    yjsState?: Buffer,
    content?: string,
    contentJson?: string,
  ): void {
    if (!this.server) {
      return;
    }
    const pageRoom = RoomBuilder.page(pageId);
    this.server.to(pageRoom).emit('page.version-restored', {
      pageId,
      yjsState: yjsState ? Array.from(new Uint8Array(yjsState)) : undefined,
      content,
      contentJson,
    });
  }

  async disconnectUser(userId: string): Promise<void> {
    if (!this.server) {
      this.logger.warn(
        'Socket server not ready, cannot disconnect user sockets.',
      );
      return;
    }

    try {
      const rootServer = (this.server as any).server || this.server;
      const userRoom = `user:${userId}`;
      const nspNames = new Set<string>(['/', '/realtime', '/chat']);

      // Retrieve dynamic namespaces if available
      const namespaces = rootServer._nsps;
      if (namespaces instanceof Map) {
        for (const nsName of namespaces.keys()) {
          nspNames.add(nsName);
        }
      } else if (namespaces && typeof namespaces === 'object') {
        for (const nsName of Object.keys(namespaces)) {
          nspNames.add(nsName);
        }
      }

      for (const nsName of nspNames) {
        try {
          const nsp = rootServer.of(nsName);
          if (nsp) {
            const sockets = await nsp.in(userRoom).fetchSockets();
            if (sockets && sockets.length > 0) {
              this.logger.log(
                `Disconnecting ${sockets.length} socket(s) in namespace "${nsName}" for user ${userId}`,
              );
              for (const socket of sockets) {
                socket.disconnect(true);
              }
            }
          }
        } catch (err) {
          this.logger.warn(
            `Error disconnecting sockets in namespace ${nsName}: ${(err as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to disconnect sockets for user ${userId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
