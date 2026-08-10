import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { NotificationsRepository } from './repositories/notifications.repository';
import { WebPushSubscriptionsRepository } from './repositories/web-push-subscriptions.repository';
import { NotificationsService } from './services/notifications.service';
import { TaskNotificationService } from './services/task-notification.service';
import { WebPushDeliveryWorker } from './services/web-push-delivery-worker.service';

import { NotificationsModule } from './notifications.module';

@Module({})
class EmptyModule {}

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: { get: jest.fn() },
    },
    {
      provide: EventEmitter2,
      useValue: { emit: jest.fn() },
    },
  ],
  exports: [ConfigService, EventEmitter2],
})
class TestDependenciesModule {}

describe('NotificationsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [TestDependenciesModule, NotificationsModule],
    })
      .overrideModule(AuthModule)
      .useModule(EmptyModule)
      .overrideModule(WorkspacesModule)
      .useModule(EmptyModule)
      .overrideModule(MongooseModule)
      .useModule(EmptyModule)
      .overrideProvider(NotificationsRepository)
      .useValue({})
      .overrideProvider(WebPushSubscriptionsRepository)
      .useValue({})
      .overrideProvider(NotificationsService)
      .useValue({})
      .overrideProvider(TaskNotificationService)
      .useValue({})
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: jest.fn() })
      .compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('resolves the durable Web Push delivery worker', () => {
    expect(module.get(WebPushDeliveryWorker)).toBeInstanceOf(
      WebPushDeliveryWorker,
    );
  });
});
