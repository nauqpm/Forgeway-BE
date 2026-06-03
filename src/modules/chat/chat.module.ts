import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token.module';
import { AuditModule } from '../audit/audit.module';
import { ChatService } from './services/chat.service';
import { ChatGateway } from './gateways/chat.gateway';
import { ChatController } from './controllers/chat.controller';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AuthModule,
    TokenModule,
    AuditModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
