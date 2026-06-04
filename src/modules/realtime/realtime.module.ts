import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { RedisModule } from '../../infra/redis/redis.module';
import { TokenModule } from '../auth/token.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema';
import { NotificationRealtimeListener } from './listeners/notification-realtime.listener';
import { TaskDetailRealtimeListener } from './listeners/task-detail-realtime.listener';
import { TaskRealtimeListener } from './listeners/task-realtime.listener';
import { WorkspaceRealtimeListener } from './listeners/workspace-realtime.listener';
import { RealtimePublisher } from './publishers/realtime.publisher';
import { RealtimeRoomRepository } from './repositories/realtime-room.repository';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './services/presence.service';
import { RoomManagerService } from './services/room-manager.service';
import { SocketAuthService } from './services/socket-auth.service';

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
    RedisModule,
  ],
  providers: [
    RealtimeGateway,
    RealtimeService,
    SocketAuthService,
    RoomManagerService,
    PresenceService,
    RealtimeRoomRepository,
    RealtimePublisher,
    TaskRealtimeListener,
    TaskDetailRealtimeListener,
    NotificationRealtimeListener,
    WorkspaceRealtimeListener,
  ],
  exports: [RealtimeService, RealtimePublisher],
})
export class RealtimeModule {}