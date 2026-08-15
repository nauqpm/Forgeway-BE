import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { RedisModule } from '../../infra/redis/redis.module';
import { TokenModule } from '../auth/token.module';
import { PagesModule } from '../pages/pages.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { NotificationRealtimeListener } from './listeners/notification-realtime.listener';
import { TaskDetailRealtimeListener } from './listeners/task-detail-realtime.listener';
import { SprintRealtimeListener } from './listeners/sprint-realtime.listener';
import { TaskRealtimeListener } from './listeners/task-realtime.listener';
import { WorkspaceRealtimeListener } from './listeners/workspace-realtime.listener';
import { UserRealtimeListener } from './listeners/user-realtime.listener';
import { RealtimePublisher } from './publishers/realtime.publisher';
import { RealtimeRoomRepository } from './repositories/realtime-room.repository';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { WorkspacePresenceService } from './services/workspace-presence.service';
import { RoomManagerService } from './services/room-manager.service';
import { PageCollabService } from './services/page-collab.service';
import { SocketAuthService } from './services/socket-auth.service';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    TokenModule,
    forwardRef(() => PagesModule),
    RedisModule,
    PresenceModule,
  ],
  providers: [
    RealtimeGateway,
    RealtimeService,
    SocketAuthService,
    RoomManagerService,
    WorkspacePresenceService,
    RealtimeRoomRepository,
    RealtimePublisher,
    PageCollabService,
    TaskRealtimeListener,
    SprintRealtimeListener,
    TaskDetailRealtimeListener,
    NotificationRealtimeListener,
    WorkspaceRealtimeListener,
    UserRealtimeListener,
  ],
  exports: [RealtimeService, RealtimePublisher, SocketAuthService],
})
export class RealtimeModule {}
