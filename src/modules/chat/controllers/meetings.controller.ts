import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MeetingService } from '../services/meeting.service';
import { CHAT_THROTTLE_CONFIG } from '../constants/chat-throttler.constants';

/**
 * Dedicated REST controller for Meeting resources (per D-15).
 * Provides endpoints consumed by the frontend MeetingBanner (D-04/D-05)
 * and MeetingPage to fetch meeting state.
 */
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingService: MeetingService) {}

  /**
   * GET /meetings/channel/:channelId/active
   * Returns the currently active meeting for a channel, or null.
   * Used by the frontend banner (lazy check per D-05).
   */
  @Get('channel/:channelId/active')
  // @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getActiveMeetingByChannel(@Param('channelId') channelId: string) {
    const meeting = await this.meetingService.findActive(channelId);
    return meeting || null;
  }

  /**
   * GET /meetings/:id
   * Returns meeting details including participants.
   * Used by the MeetingPage when initialising (per D-01).
   */
  @Get(':id')
  // @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getMeetingById(@Param('id') id: string) {
    return this.meetingService.findById(id);
  }
}
