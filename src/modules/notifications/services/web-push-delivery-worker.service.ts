import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { WEB_PUSH_DELIVERY_POLICY } from '../config/web-push.config';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { NotificationDocument } from '../schemas/notification.schema';
import { WebPushService } from './web-push.service';

@Injectable()
export class WebPushDeliveryWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WebPushDeliveryWorker.name);
  private isTickRunning = false;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly webPushService: WebPushService,
  ) {}

  onApplicationBootstrap(): void {
    void this.runScheduledTick();
    this.pollTimer = setInterval(
      () => void this.runScheduledTick(),
      WEB_PUSH_DELIVERY_POLICY.pollIntervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.isTickRunning) return;
    this.isTickRunning = true;
    const tickStartedAt = Date.now();
    let claimNow = now;

    try {
      while (true) {
        const leaseUntil = new Date(
          claimNow.getTime() + WEB_PUSH_DELIVERY_POLICY.leaseMs,
        );
        const notification =
          await this.notificationsRepository.claimDuePushDelivery(
            claimNow,
            leaseUntil,
          );
        if (!notification) return;
        await this.processClaim(notification, claimNow, leaseUntil);
        claimNow = new Date(
          now.getTime() + Math.max(0, Date.now() - tickStartedAt),
        );
      }
    } finally {
      this.isTickRunning = false;
    }
  }

  private async processClaim(
    notification: NotificationDocument,
    now: Date,
    heldLeaseUntil: Date,
  ): Promise<void> {
    const notificationId = notification._id.toString();
    const expiresAt =
      notification.createdAt.getTime() + WEB_PUSH_DELIVERY_POLICY.expiryMs;
    if (now.getTime() >= expiresAt) {
      await this.notificationsRepository.markPushExpired(
        notificationId,
        heldLeaseUntil,
      );
      return;
    }

    const result = await this.webPushService.sendToUser(notification);
    if (result.kind === 'delivered') {
      await this.notificationsRepository.markPushDelivered(
        notificationId,
        heldLeaseUntil,
        now,
      );
      return;
    }
    if (result.kind === 'skipped') {
      await this.notificationsRepository.markPushSkipped(
        notificationId,
        heldLeaseUntil,
      );
      return;
    }

    const nextAttemptNumber = notification.pushAttempts + 1;
    if (nextAttemptNumber >= WEB_PUSH_DELIVERY_POLICY.maxAttempts) {
      await this.notificationsRepository.markPushFailed(
        notificationId,
        heldLeaseUntil,
        result.statusCode,
      );
      return;
    }

    const delayMs =
      WEB_PUSH_DELIVERY_POLICY.retryDelaysMs[nextAttemptNumber - 1];
    await this.notificationsRepository.schedulePushRetry(
      notificationId,
      heldLeaseUntil,
      new Date(now.getTime() + delayMs),
      result.statusCode,
    );
  }

  private async runScheduledTick(): Promise<void> {
    try {
      await this.tick(new Date());
    } catch {
      this.logger.warn({
        event: 'web_push_delivery_worker_tick_failed',
        notificationId: null,
        attempt: null,
        status: null,
        providerHost: null,
      });
    }
  }
}
