import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (config: ConfigService) => {
        const ttl = config.get<number>('KANBAN_CACHE_TTL_MS') ?? 60_000;
        const redisUrl = config.get<string>('REDIS_URL');

        if (!redisUrl) {
          return {
            ttl,
            max: config.get<number>('KANBAN_MEMORY_CACHE_MAX') ?? 1_000,
          };
        }

        return {
          ttl,
          store: await redisStore({
            url: redisUrl,
            socket: {
              reconnectStrategy: (retries: number) =>
                Math.min(retries * 50, 1_000),
              connectTimeout:
                config.get<number>('REDIS_CONNECT_TIMEOUT_MS') ?? 5_000,
            },
            database: config.get<number>('REDIS_DB') ?? 0,
          }),
        };
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
