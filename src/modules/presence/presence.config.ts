import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PresenceConfig {
  readonly heartbeatIntervalMs: number;
  readonly connTtlMs: number;
  readonly offlineGraceMs: number;
  readonly sweepIntervalMs: number;
  readonly maxSubscriptions: number;
  readonly batchMaxIds: number;

  constructor(private readonly configService: ConfigService) {
    this.heartbeatIntervalMs = this.readPositiveInt(
      'PRESENCE_HEARTBEAT_INTERVAL_MS',
      25_000,
    );
    this.connTtlMs = this.readPositiveInt('PRESENCE_CONN_TTL_MS', 90_000);
    this.offlineGraceMs = this.readPositiveInt(
      'PRESENCE_OFFLINE_GRACE_MS',
      30_000,
    );
    this.sweepIntervalMs = this.readPositiveInt(
      'PRESENCE_SWEEP_INTERVAL_MS',
      10_000,
    );
    this.maxSubscriptions = this.readPositiveInt(
      'PRESENCE_MAX_SUBSCRIPTIONS',
      500,
    );
    this.batchMaxIds = this.readPositiveInt('PRESENCE_BATCH_MAX_IDS', 100);
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (raw == null || raw.trim() === '') return fallback;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }
}
