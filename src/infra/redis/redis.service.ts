import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

type RedisClient = RedisClientType;

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
      database: this.getIntegerConfig('REDIS_DB', 0),
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 50, 1_000),
        connectTimeout: this.getIntegerConfig(
          'REDIS_CONNECT_TIMEOUT_MS',
          5_000,
        ),
      },
    });

    client.on('error', (error: Error) => {
      this.logger.warn(
        `Redis client ${label} error: ${this.formatError(error)}`,
      );
    });

    try {
      await client.connect();
    } catch (error) {
      this.logger.warn(
        `Redis client ${label} unavailable: ${this.formatError(error)}`,
      );
      await client.disconnect().catch(() => undefined);
      return null;
    }

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

  private getIntegerConfig(key: string, fallback: number): number {
    const value = this.configService.get<string | number>(key);
    if (value === undefined || value === null || value === '') return fallback;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      this.logger.warn(
        `${key} must be a non-negative integer. Falling back to ${fallback}.`,
      );
      return fallback;
    }

    return parsed;
  }

  private formatError(error: unknown): string {
    if (error instanceof AggregateError) {
      return error.errors.map(item => this.formatError(item)).join('; ');
    }

    if (error instanceof Error) {
      const details = [
        error.message,
        'code' in error ? String((error as NodeJS.ErrnoException).code) : '',
      ].filter(Boolean);
      return details.join(' ');
    }

    return String(error);
  }
}
