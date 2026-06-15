import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationMapper } from './mappers/notification.mapper';
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
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationMapper,
    NotificationFactoryService,
    NotificationDomainEventPublisher,
    NotificationsService,
    JwtAuthGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
