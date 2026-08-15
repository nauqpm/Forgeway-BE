import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PresenceConfig } from '../presence.config';
import { PresenceService } from './presence.service';
import { PresenceStateService } from './presence-state.service';

@Injectable()
export class PresenceSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceSweeper.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stateService: PresenceStateService,
    private readonly presenceService: PresenceService,
    private readonly config: PresenceConfig,
  ) {}

  private isShuttingDown = false;

  onModuleInit(): void {
    this.scheduleNextSweep();
    this.logger.log(
      `Presence sweeper started (interval: ${this.config.sweepIntervalMs}ms).`,
    );
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.sweepTimer) {
      clearTimeout(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private scheduleNextSweep(): void {
    if (this.isShuttingDown) return;
    this.sweepTimer = setTimeout(async () => {
      await this.sweep();
      this.scheduleNextSweep();
    }, this.config.sweepIntervalMs);
  }

  private async sweep(): Promise<void> {
    if (!this.stateService.isAvailable()) return;

    const lockTtlMs = this.config.sweepIntervalMs;
    const isLeader = await this.stateService.claimSweepLock(lockTtlMs);
    if (!isLeader) {
      this.logger.debug('Not the sweep leader — skipping.');
      return;
    }

    const now = Date.now();
    const expired = await this.stateService.getExpiredConns(now);

    if (expired.length > 0) {
      this.logger.log(
        `Sweep found ${expired.length} expired connection(s). Processing…`,
      );
    }

    await this.stateService.removeExpiredConns(now);

    for (const { userId, socketId } of expired) {
      try {
        await this.presenceService.handleExpiredConn(userId, socketId, now);
      } catch (error) {
        this.logger.error(
          `Sweep error for ${userId}/${socketId}: ${(error as Error).message}`,
        );
      }
    }
  }
}
