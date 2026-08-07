import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { NotificationSummaryPayload } from '../../../shared/events/domain-events/notification';
import { WebPushSubscriptionDocument } from '../schemas/web-push-subscription.schema';
import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

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

  async sendNotification(
    notification: NotificationSummaryPayload,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const subscriptions = await this.subscriptionsService.findForUser(
      notification.recipientId,
    );
    const payload = JSON.stringify({
      notificationId: notification.id,
      title: notification.title,
      message: notification.message,
      tag: `al-task:${notification.id}`,
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
            TTL: 300,
            urgency: 'normal',
          },
        ),
      ),
    );

    await Promise.all(
      results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [
              this.handleSendFailure(
                notification.id,
                notification.recipientId,
                subscriptions[index],
                result.reason,
              ),
            ]
          : [],
      ),
    );
  }

  private async handleSendFailure(
    notificationId: string,
    userId: string,
    subscription: WebPushSubscriptionDocument,
    error: unknown,
  ): Promise<void> {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      try {
        await this.subscriptionsService.removeForUser(
          userId,
          subscription.endpoint,
        );
      } catch {
        this.logger.warn({
          event: 'web_push_subscription_removal_failed',
          notificationId,
          status,
        });
      }
      return;
    }

    this.logger.warn({
      event: 'web_push_delivery_failed',
      notificationId,
      status: status ?? null,
    });
  }

  private buildNotificationHref(
    notification: NotificationSummaryPayload,
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
      notification.workspaceId;
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
