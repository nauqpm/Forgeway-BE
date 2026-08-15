export const PresenceKeys = {
  globalConns: (): string => 'presence:conns',

  userConns: (userId: string): string => `presence:uconn:${userId}`,

  grace: (userId: string): string => `presence:grace:${userId}`,

  lastSeen: (userId: string): string => `presence:lastseen:${userId}`,

  invisible: (userId: string): string => `presence:inv:${userId}`,

  sweepLock: (): string => 'presence:sweep:lock',

  offWriteLock: (userId: string): string => `presence:offwrite:${userId}`,

  watchRoom: (userId: string): string => `presence:watch:${userId}`,

  globalConnMember: (userId: string, socketId: string): string =>
    `${userId}:${socketId}`,
} as const;
