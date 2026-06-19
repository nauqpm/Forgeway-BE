import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LivekitTokenService } from './livekit-token.service';
import { LivekitWebhookController } from './livekit-webhook.controller';
import { ChatModule } from '../chat/chat.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Meetings module providing LiveKit-specific services.
 * LivekitTokenService is exported so the ChatModule can inject it
 * into MeetingService without duplicating provider registration.
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ChatModule),
    RealtimeModule,
  ],
  controllers: [LivekitWebhookController],
  providers: [LivekitTokenService],
  exports: [LivekitTokenService],
})
export class MeetingsModule {}
