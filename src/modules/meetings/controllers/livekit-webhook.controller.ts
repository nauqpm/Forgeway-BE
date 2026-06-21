import {
  Controller,
  Post,
  Req,
  Headers,
  UnauthorizedException,
  Logger,
  RawBodyRequest,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { Optional } from '@nestjs/common';
import { MeetingService } from '../services/meeting.service';
import { ConfigService } from '@nestjs/config';
// import { LivekitWebhookService } from '../services/livekit-webhook.service';

/**
 * Public controller to receive Webhook events from LiveKit Cloud.
 * Validates the Authorization header using LiveKit's WebhookReceiver.
 */
@Controller('meetings/livekit/webhook')
export class LivekitWebhookController {
  private readonly logger = new Logger(LivekitWebhookController.name);

  private receiver: WebhookReceiver;

  constructor(
    private readonly meetingService: MeetingService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.getOrThrow<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.getOrThrow<string>('LIVEKIT_API_SECRET');
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
  }

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.debug(`Received LiveKit webhook`);
    if (!this.receiver) {
      throw new UnauthorizedException('LiveKit not configured');
    }

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // LiveKit SDK requires the raw unparsed body (string) for signature validation
    // Ensure rawBody is enabled in NestJS bootstrap for this to work

    if (!req.body || !Buffer.isBuffer(req.body)) {
      this.logger.error('Invalid or missing raw body');
      throw new BadRequestException('Body is missing or not a buffer');
    }
    // Chuyển Buffer thành String
    const rawBodyString = req.body.toString('utf8');

    let event: WebhookEvent;
    try {
      event = await this.receiver.receive(rawBodyString, authHeader);
    } catch (error) {
      this.logger.error(
        `Webhook signature validation failed: ${(error as Error).message}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug(`Received LiveKit webhook: ${event.event}`);

    // TODO: xử lý sự kiện
    try {
      switch (event.event) {
        case 'participant_joined':
          // this.handleParticipantJoined(event);
          break;

        case 'participant_left':
          // this.handleParticipantLeft(event);
          break;

        case 'room_finished':
          if (event.room?.name) {
            await this.meetingService.handleRoomFinished(event.room.name);
          }
          break;
      }
    } catch (error) {
      this.logger.error(
        `Error processing webhook ${event.event}: ${(error as Error).message}`,
      );
    }

    return { received: true };
  }
}
