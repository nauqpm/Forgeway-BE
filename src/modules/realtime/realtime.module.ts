import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { TokenModule } from '../auth/token.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema';
import { RealtimePublisher } from './publishers/realtime.publisher';
import { RealtimeRoomRepository } from './repositories/realtime-room.repository';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
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
  ],
  providers: [
    RealtimeGateway,
    RealtimeService,
    SocketAuthService,
    RoomManagerService,
    RealtimeRoomRepository,
    RealtimePublisher,
  ],
  exports: [RealtimeService, RealtimePublisher],
})
export class RealtimeModule {}
