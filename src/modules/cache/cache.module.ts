import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

const logger = new Logger('CacheModule');

@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (config: ConfigService) => {
        const ttl = config.get<number>('KANBAN_CACHE_TTL_MS') ?? 60_000;
        const max = config.get<number>('KANBAN_MEMORY_CACHE_MAX') ?? 1_000;
        const redisUrl = config.get<string>('REDIS_URL');

        if (!redisUrl) {
          logger.log('REDIS_URL not set — using in-memory cache');
          return { ttl, max };
        }

        try {
          const store = await redisStore({
            url: redisUrl,
            socket: {
              reconnectStrategy: (retries: number) =>
                Math.min(retries * 50, 1_000),
              connectTimeout:
                config.get<number>('REDIS_CONNECT_TIMEOUT_MS') ?? 5_000,
            },
            database: config.get<number>('REDIS_DB') ?? 0,
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
