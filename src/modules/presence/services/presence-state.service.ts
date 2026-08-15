import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../../../infra/redis/redis.service';
import { PresenceKeys } from '../presence.constants';

type RedisClient = NonNullable<
  Awaited<ReturnType<RedisService['createClient']>>
>;

export interface ConnEntry {
  userId: string;
  socketId: string;
}

class MemoryFallback {
  private kv = new Map<string, { val: string; exp: number | null }>();
  private userConns = new Map<string, Map<string, number>>();

  set(k: string, v: string, expMs?: number) {
    this.kv.set(k, { val: v, exp: expMs ? Date.now() + expMs : null });
    return true;
  }
  setNX(k: string, v: string, expMs: number) {
    const existing = this.get(k);
    if (existing !== null) return false;
    this.set(k, v, expMs);
    return true;
  }
  get(k: string) {
    const item = this.kv.get(k);
    if (!item) return null;
    if (item.exp && item.exp < Date.now()) {
      this.kv.delete(k);
      return null;
    }
    return item.val;
  }
  del(k: string) {
    this.kv.delete(k);
  }
  registerConn(userId: string, socketId: string, exp: number) {
    if (!this.userConns.has(userId)) this.userConns.set(userId, new Map());
    this.userConns.get(userId)!.set(socketId, exp);
  }
  removeConn(userId: string, socketId: string) {
    if (this.userConns.has(userId))
      this.userConns.get(userId)!.delete(socketId);
  }
  connCount(userId: string, now: number) {
    const conns = this.userConns.get(userId);
    if (!conns) return 0;
    let count = 0;
    for (const [sock, exp] of conns.entries()) {
      if (exp >= now) count++;
      else conns.delete(sock);
    }
    return count;
  }
  getExpired(now: number) {
    const expired: ConnEntry[] = [];
    for (const [userId, conns] of this.userConns.entries()) {
      for (const [socketId, exp] of conns.entries()) {
        if (exp < now) expired.push({ userId, socketId });
      }
    }
    return expired;
  }
  getConnScore(userId: string, socketId: string, now: number): number | null {
    const conns = this.userConns.get(userId);
    if (!conns) return null;
    const score = conns.get(socketId);
    if (score === undefined) return null;
    if (score < now) return null;
    return score;
  }
  removeExpired(now: number) {
    for (const conns of this.userConns.values()) {
      for (const [socketId, exp] of conns.entries()) {
        if (exp < now) conns.delete(socketId);
      }
    }
  }
}

@Injectable()
export class PresenceStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceStateService.name);
  private client: RedisClient | null = null;
  private memFallback = new MemoryFallback();

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.client = await this.redisService.createClient('presence-state');
      if (this.client) {
        this.logger.log('Presence state Redis client initialized.');
      } else {
        this.logger.warn(
          'Presence state Redis unavailable — running in degraded mode.',
        );
      }
    } catch (error) {
      this.client = null;
      this.logger.warn(
        `Presence state Redis unavailable: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client = null;
  }

  isAvailable(): boolean {
    return true; // Always available due to in-memory fallback
  }

  async registerConn(
    userId: string,
    socketId: string,
    ttlMs: number,
  ): Promise<void> {
    const expiryScore = Date.now() + ttlMs;
    if (!this.client) {
      this.memFallback.registerConn(userId, socketId, expiryScore);
      return;
    }
    const member = PresenceKeys.globalConnMember(userId, socketId);
    await Promise.all([
      this.client.zAdd(PresenceKeys.globalConns(), {
        score: expiryScore,
        value: member,
      }),
      this.client.zAdd(PresenceKeys.userConns(userId), {
        score: expiryScore,
        value: socketId,
      }),
    ]);
  }

  async removeConn(userId: string, socketId: string): Promise<void> {
    if (!this.client) {
      this.memFallback.removeConn(userId, socketId);
      return;
    }
    const member = PresenceKeys.globalConnMember(userId, socketId);
    await Promise.all([
      this.client.zRem(PresenceKeys.globalConns(), member),
      this.client.zRem(PresenceKeys.userConns(userId), socketId),
    ]);
  }

  async pruneExpiredUserConns(userId: string): Promise<void> {
    if (!this.client) return;
    const now = Date.now();
    await this.client.zRemRangeByScore(
      PresenceKeys.userConns(userId),
      '-inf',
      now,
    );
  }

  async connCount(userId: string): Promise<number> {
    if (!this.client) {
      return this.memFallback.connCount(userId, Date.now());
    }
    return this.client.zCount(
      PresenceKeys.userConns(userId),
      Date.now(),
      '+inf',
    );
  }

  async getBatchConnCount(userIds: string[]): Promise<number[]> {
    if (userIds.length === 0) return [];
    const now = Date.now();
    if (!this.client) {
      return userIds.map(id => this.memFallback.connCount(id, now));
    }
    const multi = this.client.multi();
    userIds.forEach(id => {
      multi.zCount(PresenceKeys.userConns(id), now, '+inf');
    });
    const results = await multi.exec();
    return results.map(r => (r as unknown as number) ?? 0);
  }

  async setGrace(userId: string, graceTtlMs: number): Promise<void> {
    if (!this.client) {
      this.memFallback.set(PresenceKeys.grace(userId), '1', graceTtlMs);
      return;
    }
    await this.client.set(PresenceKeys.grace(userId), '1', {
      NX: true,
      PX: graceTtlMs,
    });
  }

  async hasGrace(userId: string): Promise<boolean> {
    if (!this.client) {
      return this.memFallback.get(PresenceKeys.grace(userId)) !== null;
    }
    const val = await this.client.get(PresenceKeys.grace(userId));
    return val !== null;
  }

  async getBatchHasGrace(userIds: string[]): Promise<boolean[]> {
    if (userIds.length === 0) return [];
    if (!this.client) {
      return userIds.map(
        id => this.memFallback.get(PresenceKeys.grace(id)) !== null,
      );
    }
    const multi = this.client.multi();
    userIds.forEach(id => {
      multi.exists(PresenceKeys.grace(id));
    });
    const results = await multi.exec();
    return results.map(r => (r as unknown as number) === 1);
  }

  async clearGrace(userId: string): Promise<void> {
    if (!this.client) {
      this.memFallback.del(PresenceKeys.grace(userId));
      return;
    }
    await this.client.del(PresenceKeys.grace(userId));
  }

  async claimOffWriteLock(userId: string, ttlMs: number): Promise<boolean> {
    if (!this.client) {
      return this.memFallback.setNX(
        PresenceKeys.offWriteLock(userId),
        '1',
        ttlMs,
      );
    }
    const result = await this.client.set(
      PresenceKeys.offWriteLock(userId),
      '1',
      { NX: true, PX: ttlMs },
    );
    return result !== null;
  }

  async claimSweepLock(ttlMs: number): Promise<boolean> {
    if (!this.client) {
      return this.memFallback.setNX(PresenceKeys.sweepLock(), '1', ttlMs);
    }
    const result = await this.client.set(PresenceKeys.sweepLock(), '1', {
      NX: true,
      PX: ttlMs,
    });
    return result !== null;
  }

  async getExpiredConns(nowMs: number): Promise<ConnEntry[]> {
    if (!this.client) {
      return this.memFallback.getExpired(nowMs);
    }
    const members = await this.client.zRangeByScore(
      PresenceKeys.globalConns(),
      '-inf',
      nowMs,
    );
    return members.map(member => {
      const colonIdx = member.indexOf(':');
      const userId = member.substring(0, colonIdx);
      const socketId = member.substring(colonIdx + 1);
      return { userId, socketId };
    });
  }

  async removeExpiredConns(nowMs: number): Promise<void> {
    if (!this.client) {
      this.memFallback.removeExpired(nowMs);
      return;
    }
    await this.client.zRemRangeByScore(
      PresenceKeys.globalConns(),
      '-inf',
      nowMs,
    );
  }

  async setLastSeenCache(userId: string, iso: string): Promise<void> {
    if (!this.client) {
      this.memFallback.set(PresenceKeys.lastSeen(userId), iso);
      return;
    }
    await this.client.set(PresenceKeys.lastSeen(userId), iso);
  }

  async getLastSeenCache(userId: string): Promise<string | null> {
    if (!this.client) {
      return this.memFallback.get(PresenceKeys.lastSeen(userId));
    }
    return this.client.get(PresenceKeys.lastSeen(userId));
  }

  async getBatchLastSeenCache(userIds: string[]): Promise<(string | null)[]> {
    if (userIds.length === 0) return [];
    if (!this.client) {
      return userIds.map(id => this.memFallback.get(PresenceKeys.lastSeen(id)));
    }
    const keys = userIds.map(id => PresenceKeys.lastSeen(id));
    return this.client.mGet(keys);
  }

  async setInvisibleCache(
    userId: string,
    invisible: boolean,
    ttlMs: number,
  ): Promise<void> {
    if (!this.client) {
      this.memFallback.set(
        PresenceKeys.invisible(userId),
        invisible ? '1' : '0',
        ttlMs,
      );
      return;
    }
    await this.client.set(
      PresenceKeys.invisible(userId),
      invisible ? '1' : '0',
      { PX: ttlMs },
    );
  }

  async getInvisibleCache(userId: string): Promise<boolean | null> {
    if (!this.client) {
      const val = this.memFallback.get(PresenceKeys.invisible(userId));
      return val === null ? null : val === '1';
    }
    const val = await this.client.get(PresenceKeys.invisible(userId));
    if (val === null) return null;
    return val === '1';
  }

  async getBatchInvisibleCache(userIds: string[]): Promise<(boolean | null)[]> {
    if (userIds.length === 0) return [];
    if (!this.client) {
      return userIds.map(id => {
        const val = this.memFallback.get(PresenceKeys.invisible(id));
        return val === null ? null : val === '1';
      });
    }
    const keys = userIds.map(id => PresenceKeys.invisible(id));
    const vals = await this.client.mGet(keys);
    return vals.map(val => (val === null ? null : val === '1'));
  }

  async invalidateInvisibleCache(userId: string): Promise<void> {
    if (!this.client) {
      this.memFallback.del(PresenceKeys.invisible(userId));
      return;
    }
    await this.client.del(PresenceKeys.invisible(userId));
  }

  async getConnScore(userId: string, socketId: string): Promise<number | null> {
    if (!this.client) {
      return this.memFallback.getConnScore(userId, socketId, Date.now());
    }
    const scoreStr = await this.client.zScore(
      PresenceKeys.userConns(userId),
      socketId,
    );
    return scoreStr ?? null;
  }
}
