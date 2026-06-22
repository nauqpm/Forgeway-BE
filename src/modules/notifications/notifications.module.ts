import { Module, forwardRef } from '@nestjs/common';
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
import { NotificationDomainEventPublisher } from './services/notification-domain-event.publisher';
import { NotificationFactoryService } from './services/notification-factory.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationMapper,
    NotificationFactoryService,
    NotificationDomainEventPublisher,
    TaskNotificationListener,
    TaskNotificationService,
    NotificationsService,
    JwtAuthGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
