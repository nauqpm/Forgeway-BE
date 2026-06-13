import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class SocketThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: any): Promise<boolean> {
    const { context, limit, ttl, throttler, generateKey } = requestProps;
    const client = context.switchToWs().getClient();

    // 1. Core Throttler Logic (using default in-memory storage)
    // Track strictly by authenticated userId
    const tracker = client.data?.user?.userId || 'anonymous';
    const key = generateKey(context, tracker, throttler.name);
    
    const { totalHits, timeToExpire } = await this.storageService.increment(
      key,
      ttl,
      limit,
      throttler.blockDuration || 0,
      throttler.name,
    );

    // 2. Synchronize with Realtime Module's data structure
    // This ensures client.data.rateLimit is always updated to reflect the state
    if (client.data) {
      const now = Date.now();
      if (
        !client.data.rateLimit ||
        now - client.data.rateLimit.windowStartedAt > ttl
      ) {
        client.data.rateLimit = { windowStartedAt: now, count: totalHits };
      } else {
        client.data.rateLimit.count = totalHits;
      }
    }

    if (totalHits > limit) {
      // Emit error events compatible with both Chat and Realtime modules
      client.emit('error', {
        message: 'Too Many Requests',
        statusCode: 429,
        error: 'ThrottlerException',
      });
      
      // Also emit 'rate_limited' with remaining TTL in milliseconds
      const remainingMs = timeToExpire ? timeToExpire * 1000 : ttl;
      client.emit('rate_limited', { retryAfterMs: remainingMs });
      
      throw new ThrottlerException();
    }

    return true;
  }
}
