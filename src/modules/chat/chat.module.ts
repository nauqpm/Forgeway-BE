import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { UsersModule } from '../users/users.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ChannelsService } from './services/channels.service';
import { MessagesService } from './services/messages.service';
import { StickersService } from './services/stickers.service';
import { ChatGateway } from './gateways/chat.gateway';
import { ChannelsController } from './controllers/channels.controller';
import { StickersController } from './controllers/stickers.controller';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import {
  ChannelReadMarker,
  ChannelReadMarkerSchema,
} from './schemas/channel-read-marker.schema';
import { ChannelsRepository } from './repositories/channels.repository';
import { MessagesRepository } from './repositories/messages.repository';
import { ChannelReadMarkersRepository } from './repositories/channel-read-markers.repository';
import { StickerPack, StickerPackSchema } from './schemas/sticker-pack.schema';
import { Sticker, StickerSchema } from './schemas/sticker.schema';
import { StickerPacksRepository } from './repositories/sticker-packs.repository';
import { StickersRepository } from './repositories/stickers.repository';
import { MeetingService } from '../meetings/services/meeting.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ChannelReadMarker.name, schema: ChannelReadMarkerSchema },
      { name: StickerPack.name, schema: StickerPackSchema },
      { name: Sticker.name, schema: StickerSchema },
    ]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    TokenModule,
    AuditModule,
    RealtimeModule,
    MeetingsModule,
    ConfigModule,
    RedisModule,
  ],
  controllers: [StickersController, ChannelsController],
  providers: [
    ChannelsService,
    MessagesService,
    MeetingService,
    StickersService,
    ChatGateway,
    ChannelsRepository,
    MessagesRepository,
    ChannelReadMarkersRepository,
    StickerPacksRepository,
    StickersRepository,
  ],
  exports: [
    ChannelsService,
    ChannelsRepository,
    MessagesRepository,
    ChannelReadMarkersRepository,
    StickerPacksRepository,
    StickersRepository,
    StickersService,
  ],
})
export class ChatModule implements OnModuleInit {
  constructor(private readonly channelsService: ChannelsService) {}

  async onModuleInit() {
    await this.channelsService.ensureGlobalChannels();
  }
}
