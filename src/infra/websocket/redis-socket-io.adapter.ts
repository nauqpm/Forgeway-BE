import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';
import { RedisService } from '../redis/redis.service';

export class RedisSocketIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisSocketIoAdapter.name);
  private redisAdapter?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisService: RedisService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    if (!this.redisService.isEnabled()) {
      this.logger.warn(
        'REDIS_URL is not configured. Socket.IO will use the single-instance adapter.',
      );
      return;
    }

    const [pubClient, subClient] = await Promise.all([
      this.redisService.createClient('socket.io:pub'),
      this.redisService.createClient('socket.io:sub'),
    ]).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis Socket.IO adapter unavailable: ${message}`);
      return [null, null] as const;
    });

    if (!pubClient || !subClient) {
      this.logger.warn(
        'Redis Socket.IO adapter was not initialized because Redis clients are unavailable.',
      );
      return;
    }

    this.redisAdapter = createAdapter(pubClient, subClient);
    this.logger.log('Redis Socket.IO adapter initialized.');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);

    if (this.redisAdapter) {
      server.adapter(this.redisAdapter);
    }

    return server;
  }
}
