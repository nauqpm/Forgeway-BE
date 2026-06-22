import {
  MiddlewareConsumer,
  Module,
  NestModule,
  forwardRef,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from '../chat/chat.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MeetingsController } from './controllers/meetings.controller';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TokenModule } from '../auth/token.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesService } from '../chat/services/messages.service';
import { MeetingsRepository } from './meetings.repository';
import { LivekitWebhookController } from './controllers/livekit-webhook.controller';
import { MeetingService } from './services/meeting.service';
import { LivekitTokenService } from './services/livekit-token.service';
import { LivekitRoomService } from './services/livekit-room.service';
import { LivekitWebhookMiddleware } from './webhook.middleware';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    ConfigModule,
    forwardRef(() => ChatModule),
    RealtimeModule,
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    TokenModule,
    AuditModule,
  ],
  controllers: [LivekitWebhookController, MeetingsController],
  providers: [
    LivekitTokenService,
    LivekitRoomService,
    MeetingService,
    MeetingsRepository,
    MessagesService,
  ],
  exports: [
    LivekitTokenService,
    LivekitRoomService,
    MeetingService,
    MeetingsRepository,
  ],
})
export class MeetingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LivekitWebhookMiddleware)
      .forRoutes('meetings/livekit/webhook');
  }
}
