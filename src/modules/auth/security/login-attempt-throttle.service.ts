import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '@/infra/redis/redis.service';
import { LOGIN_DELAY_POLICY } from './login-delay.policy';

type RedisClient = Awaited<ReturnType<RedisService['createClient']>>;
type LoginDelayScope = 'email' | 'ip';

export interface LoginAttemptContext {
  email: string;
  ip: string;
}

export interface LoginFailureDelay {
  emailAttempts: number;
  ipAttempts: number;
  retryAfterSeconds: number;
}

const REGISTER_FAILURE_SCRIPT = `
local attempts = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])

local freeAttempts = tonumber(ARGV[2])
local delay = 0

if attempts >= freeAttempts then
  local delayIndex = attempts - freeAttempts + 1
  local delayCount = #ARGV - 2
  if delayIndex > delayCount then
    delayIndex = delayCount
  end
  delay = tonumber(ARGV[delayIndex + 2])
end

if delay > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', delay * 1000)
end

return { attempts, delay }
`;

@Injectable()
export class LoginAttemptThrottleService implements OnModuleInit {
  private readonly logger = new Logger(LoginAttemptThrottleService.name);
  private redisClient: RedisClient = null;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.redisClient =
        await this.redisService.createClient('auth-login-delay');
      if (this.redisClient) {
        this.logger.log('Progressive login delay Redis client initialized.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.redisClient = null;
      this.logger.warn(
        `Progressive login delay is unavailable; using coarse route throttling only: ${message}`,
      );
    }
  }

  async getRetryAfterSeconds(context: LoginAttemptContext): Promise<number> {
    if (!this.redisClient) return 0;

    try {
      const [emailTtlMs, ipTtlMs] = await Promise.all([
        this.redisClient.pTTL(this.getKeys('email', context.email).cooldown),
        this.redisClient.pTTL(this.getKeys('ip', context.ip).cooldown),
      ]);

      return Math.ceil(Math.max(0, emailTtlMs, ipTtlMs) / 1000);
    } catch (error) {
      this.logRuntimeDegradation('read cooldown', error);
      return 0;
    }
  }

  async registerFailure(
    context: LoginAttemptContext,
  ): Promise<LoginFailureDelay> {
    if (!this.redisClient) {
      return { emailAttempts: 0, ipAttempts: 0, retryAfterSeconds: 0 };
    }

    try {
      const [emailResult, ipResult] = await Promise.all([
        this.registerScopeFailure('email', context.email),
        this.registerScopeFailure('ip', context.ip),
      ]);

      return {
        emailAttempts: emailResult.attempts,
        ipAttempts: ipResult.attempts,
        retryAfterSeconds: Math.max(
          emailResult.retryAfterSeconds,
          ipResult.retryAfterSeconds,
        ),
      };
    } catch (error) {
      this.logRuntimeDegradation('register failure', error);
      return { emailAttempts: 0, ipAttempts: 0, retryAfterSeconds: 0 };
    }
  }

  async clear(context: LoginAttemptContext): Promise<void> {
    if (!this.redisClient) return;

    const emailKeys = this.getKeys('email', context.email);
    const ipKeys = this.getKeys('ip', context.ip);
    try {
      await this.redisClient.del([
        emailKeys.attempts,
        emailKeys.cooldown,
        ipKeys.attempts,
        ipKeys.cooldown,
      ]);
    } catch (error) {
      this.logRuntimeDegradation('clear failure state', error);
    }
  }

  private async registerScopeFailure(
    scope: LoginDelayScope,
    value: string,
  ): Promise<{ attempts: number; retryAfterSeconds: number }> {
    if (!this.redisClient) {
      return { attempts: 0, retryAfterSeconds: 0 };
    }

    const keys = this.getKeys(scope, value);
    const result = await this.redisClient.eval(REGISTER_FAILURE_SCRIPT, {
      keys: [keys.attempts, keys.cooldown],
      arguments: [
        String(LOGIN_DELAY_POLICY.failureWindowMs),
        String(LOGIN_DELAY_POLICY.freeFailedAttempts),
        ...LOGIN_DELAY_POLICY.backoffSeconds.map(String),
      ],
    });

    if (!Array.isArray(result) || result.length < 2) {
      throw new Error('Unexpected Redis login delay response.');
    }

    return {
      attempts: Number(result[0]),
      retryAfterSeconds: Number(result[1]),
    };
  }

  private getKeys(
    scope: LoginDelayScope,
    value: string,
  ): { attempts: string; cooldown: string } {
    const normalized =
      scope === 'email'
        ? value.normalize('NFKC').trim().toLowerCase()
        : value.trim() || 'unknown';
    const hash = createHash('sha256').update(normalized).digest('hex');
    const prefix = `auth:login-delay:${scope}:${hash}`;

    return {
      attempts: `${prefix}:attempts`,
      cooldown: `${prefix}:cooldown`,
    };
  }

  private logRuntimeDegradation(operation: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Progressive login delay could not ${operation}; coarse route throttling remains active: ${message}`,
    );
  }
}
