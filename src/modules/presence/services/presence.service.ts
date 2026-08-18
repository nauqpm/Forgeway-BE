import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Server } from 'socket.io';
import { User, UserDocument } from '../../users/schemas/users.schema';
import { PresenceConfig } from '../presence.config';
import { PresenceKeys } from '../presence.constants';
import { PresenceStateService } from './presence-state.service';

export type PresenceStatus = 'online' | 'offline';

export interface PresenceUpdatePayload {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string | null;
}

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private server: Server | null = null;
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly stateService: PresenceStateService,
    private readonly config: PresenceConfig,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  onModuleDestroy() {
    for (const timer of this.graceTimers.values()) {
      clearTimeout(timer);
    }
    this.graceTimers.clear();
  }

  bindServer(server: Server): void {
    this.server = server;
  }

  async registerConnection(userId: string, socketId: string): Promise<void> {
    if (!this.stateService.isAvailable()) return;

    const hadGrace = await this.stateService.hasGrace(userId);

    await this.stateService.registerConn(
      userId,
      socketId,
      this.config.connTtlMs,
    );

    if (hadGrace) {
      const timer = this.graceTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        this.graceTimers.delete(userId);
      }
      await this.stateService.clearGrace(userId);
      this.logger.debug(
        `User ${userId} reconnected within grace window — suppressed offline.`,
      );
      return;
    }

    const count = await this.stateService.connCount(userId);
    if (count === 1) {
      await this.broadcastOnline(userId);
    }
  }

  async registerDisconnection(userId: string, socketId: string): Promise<void> {
    if (!this.stateService.isAvailable()) return;

    await this.stateService.removeConn(userId, socketId);

    const count = await this.stateService.connCount(userId);
    if (count > 0) return;

    await this.stateService.setGrace(userId, this.config.offlineGraceMs);

    const timer = setTimeout(
      () => void this.onGraceExpired(userId),
      this.config.offlineGraceMs,
    );
    this.graceTimers.set(userId, timer);
  }

  async heartbeat(userId: string, socketId: string): Promise<void> {
    if (!this.stateService.isAvailable()) return;
    await this.stateService.registerConn(
      userId,
      socketId,
      this.config.connTtlMs,
    );
  }

  async handleExpiredConn(
    userId: string,
    socketId: string,
    sweepTime: number,
  ): Promise<void> {
    const currentScore = await this.stateService.getConnScore(userId, socketId);
    if (currentScore !== null && currentScore > sweepTime) {
      this.logger.debug(
        `Skipping expired conn ${userId}/${socketId} — score refreshed by heartbeat.`,
      );
      return;
    }
    await this.registerDisconnection(userId, socketId);
  }

  private async onGraceExpired(userId: string): Promise<void> {
    this.graceTimers.delete(userId);

    const count = await this.stateService.connCount(userId);
    if (count > 0) return;

    const claimed = await this.stateService.claimOffWriteLock(userId, 60_000);
    if (!claimed) return;

    await this.persistOffline(userId);
  }

  private async persistOffline(userId: string): Promise<void> {
    const lastSeenAt = new Date();
    const iso = lastSeenAt.toISOString();

    try {
      await this.userModel
        .findByIdAndUpdate(userId, { $set: { lastSeenAt } })
        .exec();
      await this.stateService.setLastSeenCache(userId, iso);

      const invisible = await this.resolveInvisible(userId);
      this.broadcastOffline(userId, invisible ? null : iso);
    } catch (error) {
      this.logger.error(
        `Failed to persist lastSeenAt for user ${userId}: ${(error as Error).message}`,
      );
    }
  }

  private async resolveInvisible(userId: string): Promise<boolean> {
    const cached = await this.stateService.getInvisibleCache(userId);
    if (cached !== null) return cached;
    const user = await this.userModel.findById(userId).lean().exec();
    const invisible =
      (user as { presenceInvisible?: boolean } | null)?.presenceInvisible ??
      false;
    await this.stateService.setInvisibleCache(userId, invisible, 3600000);
    return invisible;
  }

  private async broadcastOnline(userId: string): Promise<void> {
    if (!this.server) return;
    const invisible = await this.resolveInvisible(userId);
    if (invisible) {
      this.logger.debug(
        `Suppressed online broadcast for invisible user: ${userId}`,
      );
      return;
    }
    const payload: PresenceUpdatePayload = {
      userId,
      status: 'online',
      lastSeenAt: null,
    };
    this.server
      .to(PresenceKeys.watchRoom(userId))
      .emit('presence.update', payload);
    this.logger.debug(`Broadcast online: ${userId}`);
  }

  private broadcastOffline(userId: string, lastSeenAt: string | null): void {
    if (!this.server) return;
    const payload: PresenceUpdatePayload = {
      userId,
      status: 'offline',
      lastSeenAt,
    };
    this.server
      .to(PresenceKeys.watchRoom(userId))
      .emit('presence.update', payload);
    this.logger.debug(`Broadcast offline: ${userId}`);
  }

  async setInvisible(userId: string, invisible: boolean): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      this.logger.warn(`setInvisible called with invalid userId: ${userId}`);
      return;
    }

    await this.userModel
      .findByIdAndUpdate(userId, { presenceInvisible: invisible })
      .exec();
    await this.stateService.setInvisibleCache(userId, invisible, 3600000);

    if (invisible) {
      this.broadcastOffline(userId, null);
    } else {
      const conns = await this.stateService.connCount(userId);
      const hasGrace =
        conns === 0 ? await this.stateService.hasGrace(userId) : false;
      const isOnline = conns > 0 || hasGrace;
      if (isOnline) {
        await this.broadcastOnline(userId);
      } else {
        const lastSeenStr = await this.stateService.getLastSeenCache(userId);
        this.broadcastOffline(userId, lastSeenStr ?? null);
      }
    }
  }
}
