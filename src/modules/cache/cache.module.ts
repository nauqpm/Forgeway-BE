import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

const logger = new Logger('CacheModule');

const getNonNegativeInteger = (
  config: ConfigService,
  key: string,
  fallback: number,
): number => {
  const value = config.get<string | number>(key);
  if (value === undefined || value === null || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    logger.warn(`${key} must be a non-negative integer; using ${fallback}.`);
    return fallback;
  }

  return parsed;
};

@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (config: ConfigService) => {
        const ttl = getNonNegativeInteger(
          config,
          'KANBAN_CACHE_TTL_MS',
          60_000,
        );
        const max = getNonNegativeInteger(
          config,
          'KANBAN_MEMORY_CACHE_MAX',
          1_000,
        );
        const connectTimeout = getNonNegativeInteger(
          config,
          'REDIS_CONNECT_TIMEOUT_MS',
          5_000,
        );
        const database = getNonNegativeInteger(config, 'REDIS_DB', 0);
        const redisUrl = config.get<string>('REDIS_URL');

        if (!redisUrl) {
          logger.log('REDIS_URL not set — using in-memory cache');
          return { ttl, max };
        }

        try {
          const store = await redisStore({
            url: redisUrl,
            socket: {
              reconnectStrategy: (retries: number) => {
                if (retries > 10)
                  return new Error('Max Redis reconnect retries reached');
                return Math.min(retries * 50, 1_000);
              },
              connectTimeout,
            },
            database,
          });
          logger.log('Redis cache connected');
          return { ttl, store };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            `Redis unavailable (${msg}) — falling back to in-memory cache`,
          );
          return { ttl, max };
        }
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
