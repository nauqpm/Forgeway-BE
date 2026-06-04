import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

import { JoinTaskRoomDto } from '../dto/join-task-room.dto';
import { JoinWorkspaceRoomDto } from '../dto/join-workspace-room.dto';
import { LeaveTaskRoomDto } from '../dto/leave-task-room.dto';
import { LeaveWorkspaceRoomDto } from '../dto/leave-workspace-room.dto';
import { AuthenticatedSocket, RoomBuilder, SocketUser } from '../contracts';
import { RealtimeRoomRepository } from '../repositories/realtime-room.repository';

@Injectable()
export class RoomManagerService {
  constructor(private readonly roomRepository: RealtimeRoomRepository) {}

  async joinWorkspace(
    client: AuthenticatedSocket,
    dto: JoinWorkspaceRoomDto,
  ): Promise<{ ok: boolean }> {
    const user = this.getAuthenticatedUser(client);
    await this.authorizeWorkspaceJoin(user.userId, dto.workspaceId);

    await client.join(RoomBuilder.workspace(dto.workspaceId));
    return { ok: true };
  }

  async leaveWorkspace(
    client: AuthenticatedSocket,
    dto: LeaveWorkspaceRoomDto,
  ): Promise<{ ok: boolean }> {
    this.getAuthenticatedUser(client);

    await client.leave(RoomBuilder.workspace(dto.workspaceId));
    return { ok: true };
  }

  async joinTask(
    client: AuthenticatedSocket,
    dto: JoinTaskRoomDto,
  ): Promise<{ ok: boolean }> {
    const user = this.getAuthenticatedUser(client);
    await this.authorizeTaskJoin(user.userId, dto.workspaceId, dto.taskId);

    await client.join(RoomBuilder.task(dto.taskId));
    return { ok: true };
  }

  async leaveTask(
    client: AuthenticatedSocket,
    dto: LeaveTaskRoomDto,
  ): Promise<{ ok: boolean }> {
    this.getAuthenticatedUser(client);

    await client.leave(RoomBuilder.task(dto.taskId));
    return { ok: true };
  }

  private async authorizeWorkspaceJoin(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const isMember = await this.roomRepository.workspaceMembershipExists(
      workspaceId,
      userId,
    );

    if (!isMember) {
      throw new WsException('Unauthorized workspace room');
    }
  }

  private async authorizeTaskJoin(
    userId: string,
    workspaceId: string,
    taskId: string,
  ): Promise<void> {
    const [isMember, taskExists] = await Promise.all([
      this.roomRepository.workspaceMembershipExists(workspaceId, userId),
      this.roomRepository.taskExistsInWorkspace(taskId, workspaceId),
    ]);

    if (!isMember || !taskExists) {
      throw new WsException('Unauthorized task room');
    }
  }

  private getAuthenticatedUser(client: AuthenticatedSocket): SocketUser {
    if (!client.data.user?.userId) {
      throw new WsException('Socket is not authenticated');
    }

    return client.data.user;
  }
}
