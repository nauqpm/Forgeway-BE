import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

type RedisClient = RedisClientType<Record<string, never>, Record<string, never>, Record<string, never>, 3, Record<string, never>>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly clients = new Set<RedisClient>();

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.getRedisUrl());
  }

  async createClient(label: string): Promise<RedisClient | null> {
    const url = this.getRedisUrl();

    if (!url) {
      this.logger.warn(
        `REDIS_URL is not configured. Skipping Redis client creation for ${label}.`,
      );
      return null;
    }

    const client = createClient({
      url,
      database: this.configService.get<number>('REDIS_DB') ?? 0,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 50, 1_000),
        connectTimeout:
          this.configService.get<number>('REDIS_CONNECT_TIMEOUT_MS') ?? 5_000,
      },
    });

    client.on('error', (error: Error) => {
      this.logger.warn(`Redis client ${label} error: ${error.message}`);
    });

    await client.connect();
    this.clients.add(client);
    this.logger.log(`Redis client ${label} connected.`);

    return client;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Array.from(this.clients).map(async client => {
        if (!client.isOpen) return;
        await client.quit();
      }),
    );
    this.clients.clear();
  }

  private getRedisUrl(): string | undefined {
    const url = this.configService.get<string>('REDIS_URL')?.trim();
    return url || undefined;
  }
}
