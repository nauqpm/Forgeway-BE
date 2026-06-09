import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { UsersModule } from '../users/users.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ChannelsService } from './services/channels.service';
import { MessagesService } from './services/messages.service';
import { MeetingService } from './services/meeting.service';
import { ChatGateway } from './gateways/chat.gateway';
import { ChannelsController } from './controllers/channels.controller';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { Reaction, ReactionSchema } from './schemas/reaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Meeting.name, schema: MeetingSchema },
      { name: Reaction.name, schema: ReactionSchema },
    ]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    TokenModule,
    AuditModule,
    RealtimeModule,
    RedisModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService, MessagesService, MeetingService, ChatGateway],
  exports: [ChannelsService],
})
export class ChatModule implements OnModuleInit {
  constructor(private readonly channelsService: ChannelsService) {}

  async onModuleInit() {
    await this.channelsService.createGeneralChannel();
  }
}
