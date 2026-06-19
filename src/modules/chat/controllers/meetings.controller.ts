import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MeetingService } from '../../meetings/meeting.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/types/jwt-payload.type';

/**
 * Dedicated REST controller for Meeting resources.
 * Provides endpoints consumed by the frontend MeetingBanner
 * and MeetingPage to fetch meeting state and LiveKit tokens.
 */
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingService: MeetingService) {}

  /**
   * GET /meetings/channel/:channelId/active
   * Returns the currently active meeting for a channel, or null.
   * Used by the frontend banner (lazy check).
   */
  @Get('channel/:channelId/active')
  async getActiveMeetingByChannel(@Param('channelId') channelId: string) {
    const meeting = await this.meetingService.findActive(channelId);
    if (!meeting) return null;
    return {
      ...meeting.toJSON(),
      maxParticipants: this.meetingService.maxMeshClients,
    };
  }

  /**
   * POST /meetings/:meetingId/connection-details
   * Issues a LiveKit participant token after verifying channel membership.
   * Returns { serverUrl, roomName, participantName, participantToken }.
   */
  @Post(':meetingId/connection-details')
  async getConnectionDetails(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingService.getConnectionDetails(
      meetingId,
      user.userId,
      user.email || user.userId,
    );
  }

  /**
   * GET /meetings/:id
   * Returns meeting details including participants.
   * Used by the MeetingPage when initialising.
   */
  @Get(':id')
  async getMeetingById(@Param('id') id: string) {
    const meeting = await this.meetingService.findById(id);
    return {
      ...meeting.toJSON(),
      maxParticipants: this.meetingService.maxMeshClients,
    };
  }
}
