import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChannelsService } from '../services/channels.service';
import { MessagesService } from '../services/messages.service';
import { MeetingService } from '../services/meeting.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { EditMessageDto } from '../dtos/edit-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';
import { CHAT_THROTTLE_CONFIG } from '../constants/chat-throttler.constants';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
    private readonly meetingService: MeetingService,
  ) {}

  @Get('channels')
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getUserChannels(@CurrentUser('userId') userId: string) {
    return this.channelsService.findByUser(userId);
  }

  @Get('dm/recent')
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getRecentDMs(@CurrentUser('userId') userId: string) {
    return this.channelsService.getRecentDMs(userId);
  }

  @Post('dm')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async openDM(@CurrentUser('userId') userId: string, @Body() body: { targetUserId: string }) {
    return this.channelsService.getOrCreateDM(userId, body.targetUserId);
  }

  @Get('users/search')
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async searchUsers(@CurrentUser('userId') userId: string, @Query('q') query: string) {
    return this.channelsService.searchUsers(query || '', userId);
  }

  @Get('channels/:id')
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getChannelDetails(@Param('id') id: string) {
    return this.channelsService.findById(id);
  }

  @Post('channels/:id/read')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async markAsRead(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.channelsService.markAsRead(id, userId);
    return { ok: true };
  }

  @Get('channels/:id/messages')
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getMessages(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Query() dto: CursorPaginationDto,
  ) {
    return this.messagesService.findByChannel(id, userId, dto);
  }

  @Post('channels/:id/messages')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_SEND)
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(id, userId, dto);
  }

  @Patch('messages/:id')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async editMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.edit(id, userId, dto.content);
  }

  @Delete('messages/:id')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async deleteMessage(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.messagesService.softDelete(id, userId);
  }

  @Post('messages/:id/reactions')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async toggleReaction(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { emoji: string },
  ) {
    // This method needs to be implemented in MessagesService
    return this.messagesService.toggleReaction(id, userId, body.emoji);
  }

  @Post('channels/:id/meeting')
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async createMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.create(id, userId);
  }

  @Get('channels/:id/meeting')
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getActiveMeeting(@Param('id') id: string) {
    return this.meetingService.findActive(id);
  }

  @Post('meeting/:id/join')
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async joinMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.join(id, userId);
  }

  @Post('meeting/:id/leave')
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async leaveMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.leave(id, userId);
  }

  @Patch('meeting/:id/audio')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async toggleAudio(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { isOn: boolean },
  ) {
    return this.meetingService.toggleAudio(id, userId, body.isOn);
  }

  @Patch('meeting/:id/video')
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async toggleVideo(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { isOn: boolean },
  ) {
    return this.meetingService.toggleVideo(id, userId, body.isOn);
  }

  @Post('meeting/:id/end')
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async endMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.end(id, userId);
  }
}
