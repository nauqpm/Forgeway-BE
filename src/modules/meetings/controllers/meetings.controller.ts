import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Body,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MeetingService } from '../services/meeting.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { GLOBAL_ROLES } from '@/common/constants/global-role.constants';
import { MeetingType } from '@/modules/meetings/schemas/meeting.schema';
import { CHAT_THROTTLE_CONFIG } from '@/modules/chat/constants/chat-throttler.constants';
import { Throttle } from '@nestjs/throttler/dist/throttler.decorator';
import { Roles } from '@/common/decorators/roles.decorator';

/**
 * Dedicated REST controller for Meeting resources.
 * Provides endpoints consumed by the frontend MeetingBanner
 * and MeetingPage to fetch meeting state and LiveKit tokens.
 */
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async createMeeting(
    @CurrentUser('userId') userId: string,
    @Body() body: { channelId: string; type?: MeetingType },
  ) {
    return this.meetingService.create(
      body.channelId,
      userId,
      body.type ?? 'video',
    );
  }

  @Get()
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getActiveMeeting(@Query('channelId') channelId: string) {
    const meeting = await this.meetingService.findActive(channelId);
    if (!meeting) return null;
    return {
      ...meeting.toJSON(),
      maxParticipants: this.meetingService.maxParticipants,
    };
  }

  /**
   * POST /meetings/:meetingId/connection-details
   * Issues a LiveKit participant token after verifying channel membership.
   * Returns { serverUrl, roomName, participantName, participantToken }.
   */
  @Post(':meetingId/connection-details')
  async getConnectionDetailsToJoin(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: JwtPayload,
    @Body('name') clientName?: string,
  ) {
    return this.meetingService.requestConnectionDetailsToJoin(
      meetingId,
      user.userId,
      clientName || user.email || user.userId,
    );
  }

  /**
   * POST /meetings/:meetingId/end
   * Ends the meeting. Only accessible to meeting creator or channel owner.
   */
  @Post(':meetingId/end')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  async endMeeting(
    @Param('meetingId') meetingId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.meetingService.endMeeting(meetingId, userId);
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
      maxParticipants: this.meetingService.maxParticipants,
    };
  }
}
