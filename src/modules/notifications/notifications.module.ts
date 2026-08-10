import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationMapper } from './mappers/notification.mapper';
import { TaskNotificationListener } from './listeners/task-notification.listener';
import { TaskNotificationService } from './services/task-notification.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import {
  WebPushSubscription,
  WebPushSubscriptionSchema,
} from './schemas/web-push-subscription.schema';
import {
  WebPushSubscriptionCapLock,
  WebPushSubscriptionCapLockSchema,
} from './schemas/web-push-subscription-cap-lock.schema';
import { NotificationDomainEventPublisher } from './services/notification-domain-event.publisher';
import { NotificationFactoryService } from './services/notification-factory.service';
import { NotificationsService } from './services/notifications.service';
import { WebPushSubscriptionsRepository } from './repositories/web-push-subscriptions.repository';
import { WebPushSubscriptionsService } from './services/web-push-subscriptions.service';
import { WebPushService } from './services/web-push.service';
import { WebPushNotificationListener } from './listeners/web-push-notification.listener';
import {
  parseWebPushRuntimeConfig,
  WebPushRuntimeConfig,
} from './config/web-push.config';
import { WebPushEndpointPolicy } from './services/web-push-endpoint-policy.service';

const WEB_PUSH_RUNTIME_CONFIG = Symbol('WEB_PUSH_RUNTIME_CONFIG');

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: WebPushSubscription.name, schema: WebPushSubscriptionSchema },
      {
        name: WebPushSubscriptionCapLock.name,
        schema: WebPushSubscriptionCapLockSchema,
      },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    WebPushSubscriptionsRepository,
    {
      provide: WEB_PUSH_RUNTIME_CONFIG,
      useFactory: (configService: ConfigService): WebPushRuntimeConfig =>
        parseWebPushRuntimeConfig({
          WEB_PUSH_ENABLED: configService.get<string>('WEB_PUSH_ENABLED'),
          WEB_PUSH_ALLOWED_ENDPOINT_HOSTS: configService.get<string>(
            'WEB_PUSH_ALLOWED_ENDPOINT_HOSTS',
          ),
        }),
      inject: [ConfigService],
    },
    {
      provide: WebPushEndpointPolicy,
      useFactory: (runtimeConfig: WebPushRuntimeConfig) =>
        new WebPushEndpointPolicy(runtimeConfig),
      inject: [WEB_PUSH_RUNTIME_CONFIG],
    },
    NotificationMapper,
    NotificationFactoryService,
    NotificationDomainEventPublisher,
    TaskNotificationListener,
    TaskNotificationService,
    NotificationsService,
    WebPushSubscriptionsService,
    WebPushService,
    WebPushNotificationListener,
    JwtAuthGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
