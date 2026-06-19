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
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import { MeetingService } from './meeting.service';
import { RealtimePublisher } from '../realtime/publishers/realtime.publisher';
import { REALTIME_EVENT_TYPES } from '../realtime/contracts/realtime-event-types';
import { RoomBuilder } from '../realtime/contracts/realtime-rooms';
import { Types } from 'mongoose';

/**
 * Public controller to receive Webhook events from LiveKit Cloud.
 * Validates the Authorization header using LiveKit's WebhookReceiver.
 */
@Controller('meetings/livekit/webhook')
export class LivekitWebhookController {
  private readonly logger = new Logger(LivekitWebhookController.name);
  private receiver: WebhookReceiver | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly meetingService: MeetingService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    if (apiKey && apiSecret) {
      this.receiver = new WebhookReceiver(apiKey, apiSecret);
    } else {
      this.logger.warn('LiveKit credentials missing. Webhooks will fail.');
    }
  }

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader: string,
  ) {
    if (!this.receiver) {
      throw new UnauthorizedException('LiveKit not configured');
    }

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // LiveKit SDK requires the raw unparsed body (string) for signature validation
    // Ensure rawBody is enabled in NestJS bootstrap for this to work
    const rawBody = req.rawBody?.toString('utf8');
    if (!rawBody) {
      throw new BadRequestException('Raw body is missing');
    }

    let event;
    try {
      event = await this.receiver.receive(rawBody, authHeader);
    } catch (error) {
      this.logger.error(`Webhook signature validation failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug(`Received LiveKit webhook: ${event.event}`);

    try {
      switch (event.event) {
        case 'participant_joined':
          // Optionally handle server-side tracking if not handled via Socket.IO
          break;

        case 'participant_left':
          // Extract userId from identity if formatted as "userId:roomName"
          const userIdStr = event.participant?.identity?.split(':')[0];
          if (userIdStr && event.room?.name) {
            // Because our Meeting schema query by roomName isn't easily exposed
            // in MeetingService right now, we can rely on Socket.IO for leave events
            // and use webhook purely as a fallback for room closure.
          }
          break;

        case 'room_finished':
          // LiveKit has closed the room (either explicitly or emptyTimeout)
          if (event.room?.name) {
            await this.handleRoomFinished(event.room.name);
          }
          break;
      }
    } catch (error) {
      this.logger.error(`Error processing webhook ${event.event}: ${(error as Error).message}`);
    }

    return { received: true };
  }

  private async handleRoomFinished(roomName: string) {
    try {
      // End the meeting in DB by finding it via roomName
      // Note: We need a findByRoomName method in MeetingService
      const meeting = await this.meetingService.findByRoomName(roomName);
      if (meeting && meeting.status !== 'ended') {
        meeting.status = 'ended';
        meeting.endedAt = new Date();
        await meeting.save();

        // Broadcast to clients so they can close their UI if still connected
        const endedEnvelope = {
          eventId: new Types.ObjectId().toString(),
          type: REALTIME_EVENT_TYPES.MEETING_ENDED,
          data: {
            meetingId: meeting._id.toString(),
            channelId: meeting.channelId.toString(),
            type: meeting.type,
          },
          occurredAt: new Date().toISOString(),
        };

        this.realtimePublisher.emit(
          RoomBuilder.meeting(meeting._id.toString()),
          endedEnvelope,
          '/chat',
        );
        this.realtimePublisher.emit(
          RoomBuilder.channel(meeting.channelId.toString()),
          endedEnvelope,
          '/chat',
        );
      }
    } catch (error) {
      this.logger.error(`Failed to handle room_finished for ${roomName}: ${(error as Error).message}`);
    }
  }
}
