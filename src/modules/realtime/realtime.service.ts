import { Injectable } from '@nestjs/common';
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
  private server?: Server;

  bindServer(server: Server): void {
    this.server = server;
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

    this.server.to(this.workspaceRoom(workspaceId)).emit(BOARD_REALTIME_EVENTS.BOARD_DELTA, delta);
  }

  workspaceRoom(workspaceId: string): string {
    return RoomBuilder.workspace(workspaceId);
  }
}
