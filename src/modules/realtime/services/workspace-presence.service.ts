import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

import { RedisService } from '../../../infra/redis/redis.service';
import { AuthenticatedSocket, RoomBuilder, SocketUser } from '../contracts';
import { PresenceHeartbeatDto } from '../dto/presence-heartbeat.dto';
import { RealtimeRoomRepository } from '../repositories/realtime-room.repository';

type PresenceRedisClient = NonNullable<
  Awaited<ReturnType<RedisService['createClient']>>
>;

export interface WorkspacePresenceHeartbeatResult {
  ok: boolean;
  expiresInMs: number;
  reason?: 'PRESENCE_UNAVAILABLE';
}

const PRESENCE_TTL_SECONDS = 30;
const PRESENCE_TTL_MS = PRESENCE_TTL_SECONDS * 1000;

@Injectable()
export class WorkspacePresenceService implements OnModuleInit {
  private readonly logger = new Logger(WorkspacePresenceService.name);
  private redisClient: PresenceRedisClient | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly roomRepository: RealtimeRoomRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.redisClient =
        await this.redisService.createClient('workspace-presence');
      if (this.redisClient) {
        this.logger.log('Workspace Presence Redis client initialized.');
      } else {
        this.logger.warn(
          'Workspace Presence Redis client unavailable, presence will run in degraded mode.',
        );
      }
    } catch (error) {
      this.redisClient = null;
      this.logger.warn(
        `Workspace Presence Redis client unavailable, presence will run in degraded mode: ${(error as Error).message}`,
      );
    }
  }

  async heartbeat(
    client: AuthenticatedSocket,
    dto: PresenceHeartbeatDto,
  ): Promise<WorkspacePresenceHeartbeatResult> {
    const user = this.getAuthenticatedUser(client);
    await this.authorizePresence(user.userId, dto.workspaceId, dto.taskId);

    if (!this.redisClient) {
      this.logger.warn(
        'Workspace presence heartbeat skipped because Redis is not configured.',
      );
      return {
        ok: false,
        expiresInMs: 0,
        reason: 'PRESENCE_UNAVAILABLE',
      };
    }

    const now = new Date().toISOString();
    const key = RoomBuilder.presence(dto.workspaceId, user.userId);
    const value = JSON.stringify({
      workspaceId: dto.workspaceId,
      userId: user.userId,
      socketId: client.id,
      taskId: dto.taskId ?? null,
      lastSeenAt: now,
    });

    await this.redisClient.set(key, value, { EX: PRESENCE_TTL_SECONDS });

    return {
      ok: true,
      expiresInMs: PRESENCE_TTL_MS,
    };
  }

  private async authorizePresence(
    userId: string,
    workspaceId: string,
    taskId?: string,
  ): Promise<void> {
    const [isMember, taskExists] = await Promise.all([
      this.roomRepository.workspaceMembershipExists(workspaceId, userId),
      taskId
        ? this.roomRepository.taskExistsInWorkspace(taskId, workspaceId)
        : Promise.resolve(true),
    ]);

    if (!isMember) {
      this.logger.warn(
        `Workspace presence unauthorized: user ${userId} is not member of workspace ${workspaceId}`,
      );
      throw new WsException('Unauthorized presence heartbeat');
    }

    if (!taskExists) {
      this.logger.warn(
        `Workspace presence unauthorized: task ${taskId} not found in workspace ${workspaceId}`,
      );
      throw new WsException('Unauthorized presence heartbeat');
    }
  }

  private getAuthenticatedUser(client: AuthenticatedSocket): SocketUser {
    if (!client.data.user?.userId) {
      throw new WsException('Socket is not authenticated');
    }

    return client.data.user;
  }
}
