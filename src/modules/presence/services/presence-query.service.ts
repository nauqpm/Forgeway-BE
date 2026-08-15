import { Injectable, Logger } from '@nestjs/common';
import { PresenceStateService } from './presence-state.service';
import { UsersRepository } from '../../users/repositories/users.repository';

export interface PresenceEntry {
  userId: string;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  invisible?: boolean;
}

@Injectable()
export class PresenceQueryService {
  private readonly logger = new Logger(PresenceQueryService.name);
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly stateService: PresenceStateService,
    private readonly usersRepo: UsersRepository,
  ) {}

  async getPresence(
    targetUserId: string,
    viewerUserId: string,
  ): Promise<PresenceEntry> {
    const entry = await this.resolvePresence(targetUserId);
    return this.applyMask(entry, viewerUserId);
  }

  async getBatchPresence(
    targetUserIds: string[],
    viewerUserId: string,
  ): Promise<PresenceEntry[]> {
    if (targetUserIds.length === 0) return [];

    const invisibles =
      await this.stateService.getBatchInvisibleCache(targetUserIds);
    const lastSeens =
      await this.stateService.getBatchLastSeenCache(targetUserIds);
    const connCounts = await this.stateService.getBatchConnCount(targetUserIds);

    const missingDbIds = targetUserIds.filter(
      (_, i) => invisibles[i] === null || lastSeens[i] === null,
    );

    const dbDataMap = new Map<
      string,
      { invisible: boolean; lastSeenStr: string }
    >();
    if (missingDbIds.length > 0) {
      const users = await this.usersRepo.findByIds(missingDbIds);
      for (const user of users) {
        const id = user._id.toString();
        const inv =
          (user as { presenceInvisible?: boolean }).presenceInvisible ?? false;
        const ls = user.lastSeenAt ? user.lastSeenAt.toISOString() : '';
        dbDataMap.set(id, { invisible: inv, lastSeenStr: ls });

        this.stateService
          .setInvisibleCache(id, inv, this.CACHE_TTL_MS)
          .catch(e => this.logger.error(e));
        this.stateService
          .setLastSeenCache(id, ls)
          .catch(e => this.logger.error(e));
      }
    }

    const graceNeededIds = targetUserIds.filter((_, i) => connCounts[i] === 0);
    let graces: boolean[] = [];
    if (graceNeededIds.length > 0) {
      graces = await this.stateService.getBatchHasGrace(graceNeededIds);
    }
    const graceMap = new Map<string, boolean>();
    graceNeededIds.forEach((id, index) => {
      graceMap.set(id, graces[index]);
    });

    const entries = targetUserIds.map((id, index) => {
      let inv = invisibles[index];
      let lsStr = lastSeens[index];

      if (inv === null || lsStr === null) {
        const dbData = dbDataMap.get(id);
        if (dbData) {
          if (inv === null) inv = dbData.invisible;
          if (lsStr === null) lsStr = dbData.lastSeenStr;
        } else {
          if (inv === null) inv = false;
          if (lsStr === null) lsStr = '';
        }
      }

      const hasGrace = graceMap.get(id) ?? false;
      const status: 'online' | 'offline' =
        connCounts[index] > 0 || hasGrace ? 'online' : 'offline';

      return {
        userId: id,
        status,
        lastSeenAt: lsStr === '' ? null : lsStr,
        invisible: inv,
      };
    });

    return entries.map(entry => this.applyMask(entry, viewerUserId));
  }

  private async resolvePresence(
    userId: string,
  ): Promise<PresenceEntry & { invisible: boolean }> {
    let invisible = await this.stateService.getInvisibleCache(userId);
    let lastSeenStr = await this.stateService.getLastSeenCache(userId);

    const needsDb = invisible === null || lastSeenStr === null;

    if (needsDb) {
      const user = await this.usersRepo.findById(userId);
      if (user) {
        if (invisible === null) {
          invisible = user.presenceInvisible ?? false;
          await this.stateService.setInvisibleCache(
            userId,
            invisible,
            this.CACHE_TTL_MS,
          );
        }
        if (lastSeenStr === null) {
          lastSeenStr = user.lastSeenAt ? user.lastSeenAt.toISOString() : '';
          await this.stateService.setLastSeenCache(userId, lastSeenStr);
        }
      } else {
        invisible = invisible ?? false;
        lastSeenStr = lastSeenStr ?? '';
      }
    }

    const conns = await this.stateService.connCount(userId);
    const hasGrace =
      conns === 0 ? await this.stateService.hasGrace(userId) : false;
    const status = conns > 0 || hasGrace ? 'online' : 'offline';

    return {
      userId,
      status,
      lastSeenAt: lastSeenStr === '' ? null : lastSeenStr,
      invisible: invisible!,
    };
  }

  private applyMask(
    entry: PresenceEntry & { invisible: boolean },
    viewerUserId: string,
  ): PresenceEntry {
    const isSelf = entry.userId === viewerUserId;
    if (entry.invisible && !isSelf) {
      return {
        userId: entry.userId,
        status: 'offline',
        lastSeenAt: null,
      };
    }

    return {
      userId: entry.userId,
      status: entry.status,
      lastSeenAt: entry.lastSeenAt,
      invisible: isSelf ? entry.invisible : undefined,
    };
  }
}
