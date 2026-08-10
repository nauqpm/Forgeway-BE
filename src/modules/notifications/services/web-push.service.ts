import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { NotificationSummaryPayload } from '../../../shared/events/domain-events/notification';
import { WEB_PUSH_DELIVERY_POLICY } from '../config/web-push.config';
import { NotificationDocument } from '../schemas/notification.schema';
import { WebPushSubscriptionDocument } from '../schemas/web-push-subscription.schema';
import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

export type PushDispatchResult =
  | { kind: 'delivered'; statusCode: null }
  | { kind: 'skipped'; statusCode: null }
  | { kind: 'retry'; statusCode: number | null }
  | { kind: 'failed'; statusCode: number | null };

type DispatchNotification = NotificationSummaryPayload | NotificationDocument;

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly enabled: boolean;

  constructor(
    configService: ConfigService,
    private readonly subscriptionsService: WebPushSubscriptionsService,
  ) {
    this.enabled = configService.get<string>('WEB_PUSH_ENABLED') === 'true';
    if (this.enabled) {
      webPush.setVapidDetails(
        configService.get<string>('VAPID_SUBJECT')!,
        configService.get<string>('VAPID_PUBLIC_KEY')!,
        configService.get<string>('VAPID_PRIVATE_KEY')!,
      );
    }
  }

  async sendToUser(
    notification: DispatchNotification,
  ): Promise<PushDispatchResult> {
    if (!this.enabled) return { kind: 'skipped', statusCode: null };

    const notificationId = this.notificationId(notification);
    const userId = notification.recipientId.toString();
    const subscriptions = (
      await this.subscriptionsService.findForUser(userId)
    ).slice(0, WEB_PUSH_DELIVERY_POLICY.maxSubscriptionsPerUser);
    if (!subscriptions.length) return { kind: 'skipped', statusCode: null };

    const payload = JSON.stringify({
      notificationId,
      title: notification.title,
      message: notification.message,
      tag: `sdlc-platform:${notificationId}`,
      url: this.buildNotificationHref(notification),
    });
    const results = await Promise.allSettled(
      subscriptions.map(subscription =>
        webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            expirationTime: subscription.expirationTime,
          },
          payload,
          {
            TTL: WEB_PUSH_DELIVERY_POLICY.providerTtlSeconds,
            urgency: 'normal',
            timeout: WEB_PUSH_DELIVERY_POLICY.requestTimeoutMs,
          },
        ),
      ),
    );

    await Promise.all(
      results.map((result, index) =>
        this.recordProviderOutcome(
          notification,
          subscriptions[index],
          result,
        ),
      ),
    );

    if (results.some(result => result.status === 'fulfilled')) {
      return { kind: 'delivered', statusCode: null };
    }

    const statusCodes = results.map(result =>
      result.status === 'rejected' ? this.statusCode(result.reason) : null,
    );
    if (statusCodes.every(status => status === 404 || status === 410)) {
      return { kind: 'skipped', statusCode: null };
    }
    const retryStatus = statusCodes.find(status => this.isRetryable(status));
    if (retryStatus !== undefined) {
      return { kind: 'retry', statusCode: retryStatus };
    }

    const terminalStatus = statusCodes.find(
      status =>
        status !== 404 && status !== 410 && !this.isRetryable(status),
    );
    return { kind: 'failed', statusCode: terminalStatus ?? null };
  }

  async sendNotification(
    notification: NotificationSummaryPayload,
  ): Promise<void> {
    await this.sendToUser(notification);
  }

  private async recordProviderOutcome(
    notification: DispatchNotification,
    subscription: WebPushSubscriptionDocument,
    result: PromiseSettledResult<webPush.SendResult>,
  ): Promise<void> {
    const notificationId = this.notificationId(notification);
    const userId = notification.recipientId.toString();
    if (result.status === 'fulfilled') {
      await this.subscriptionsService.resetFailureForUser(
        userId,
        subscription.endpoint,
        subscription.refreshVersion,
      );
      return;
    }

    const status = this.statusCode(result.reason);
    this.logger.warn({
      event: 'web_push_delivery_failed',
      notificationId,
      attempt: this.attemptNumber(notification),
      status,
      providerHost: this.providerHost(subscription.endpoint),
    });

    if (status === 404 || status === 410) {
      await this.subscriptionsService.removeForUser(
        userId,
        subscription.endpoint,
        subscription.refreshVersion,
      );
      return;
    }
    if (!this.isRetryable(status)) {
      await this.subscriptionsService.recordFailureForUser(
        userId,
        subscription.endpoint,
        subscription.refreshVersion,
      );
    }
  }

  private isRetryable(status: number | null): boolean {
    return (
      status === null ||
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    );
  }

  private statusCode(error: unknown): number | null {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
    ) {
      return error.statusCode;
    }
    return null;
  }

  private providerHost(endpoint: string): string | null {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return null;
    }
  }

  private attemptNumber(notification: DispatchNotification): number {
    const pushAttempts = (notification as { pushAttempts?: unknown })
      .pushAttempts;
    return typeof pushAttempts === 'number' ? pushAttempts + 1 : 1;
  }

  private notificationId(notification: DispatchNotification): string {
    const id = (notification as { id?: unknown }).id;
    return typeof id === 'string'
      ? id
      : (notification as NotificationDocument)._id.toString();
  }

  private buildNotificationHref(
    notification: DispatchNotification,
  ): string | undefined {
    if (notification.type === 'WORKSPACE_INVITED') {
      return '/workspaces';
    }

    const metadata = notification.metadata ?? {};
    const channelId = this.stringMetadata(metadata, 'channelId');
    const messageId = this.stringMetadata(metadata, 'messageId');
    if (notification.type === 'THREAD_REPLY') {
      const parentId =
        this.stringMetadata(metadata, 'parentId') ??
        this.stringMetadata(metadata, 'threadParentId') ??
        messageId;
      if (channelId && parentId) {
        const base = `/chat?channelId=${encodeURIComponent(channelId)}&threadParentId=${encodeURIComponent(parentId)}`;
        return messageId
          ? `${base}&messageId=${encodeURIComponent(messageId)}`
          : base;
      }
    }

    if (notification.type === 'CHAT_MENTIONED' && channelId) {
      const base = `/chat?channelId=${encodeURIComponent(channelId)}`;
      return messageId
        ? `${base}&messageId=${encodeURIComponent(messageId)}`
        : base;
    }

    const taskKey = this.stringMetadata(metadata, 'taskKey');
    const workspaceRouteKey =
      this.stringMetadata(metadata, 'workspaceKey') ??
      this.stringMetadata(metadata, 'workspaceId') ??
      notification.workspaceId?.toString();
    return taskKey && workspaceRouteKey
      ? `/workspaces/${encodeURIComponent(workspaceRouteKey)}/board/key/${encodeURIComponent(taskKey)}`
      : undefined;
  }

  private stringMetadata(
    metadata: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' ? value : undefined;
  }
}
