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
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { ChannelsService } from '../services/channels.service';
import { MessagesService } from '../services/messages.service';
import { MeetingService } from '../services/meeting.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { EditMessageDto } from '../dtos/edit-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';
import { CHAT_THROTTLE_CONFIG } from '../constants/chat-throttler.constants';

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
    private readonly meetingService: MeetingService,
  ) {}

  @Get('channels')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getUserChannels(@CurrentUser('userId') userId: string) {
    return this.channelsService.findByUser(userId);
  }

  @Get('dm/recent')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getRecentDMs(@CurrentUser('userId') userId: string) {
    return this.channelsService.getRecentDMs(userId);
  }

  @Post('dm')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async openDM(@CurrentUser('userId') userId: string, @Body() body: { targetUserId: string }) {
    return this.channelsService.getOrCreateDM(userId, body.targetUserId);
  }

  @Get('users/search')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async searchUsers(@CurrentUser('userId') userId: string, @Query('q') query: string) {
    return this.channelsService.searchUsers(query || '', userId);
  }

  @Get(':id')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getChannelDetails(@Param('id') id: string) {
    return this.channelsService.findById(id);
  }

  @Post('channels/:id/read')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async markAsRead(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.channelsService.markAsRead(id, userId);
    return { ok: true };
  }

  @Get('channels/:id/messages')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getMessages(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Query() dto: CursorPaginationDto,
  ) {
    return this.messagesService.findByChannel(id, userId, dto);
  }

  @Post('channels/:id/messages')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_SEND)
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(id, userId, dto);
  }

  @Patch('messages/:id')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async editMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.edit(id, userId, dto.content);
  }

  @Delete('messages/:id')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async deleteMessage(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.messagesService.softDelete(id, userId);
  }

  @Post('messages/:id/reactions')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
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
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async createMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.create(id, userId);
  }

  @Get('channels/:id/meeting')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getActiveMeeting(@Param('id') id: string) {
    return this.meetingService.findActive(id);
  }

  @Post('meeting/:id/join')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async joinMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.join(id, userId);
  }

  @Post('meeting/:id/leave')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async leaveMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.leave(id, userId);
  }

  @Patch('meeting/:id/audio')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async toggleAudio(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { isOn: boolean },
  ) {
    return this.meetingService.toggleAudio(id, userId, body.isOn);
  }

  @Patch('meeting/:id/video')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async toggleVideo(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { isOn: boolean },
  ) {
    return this.meetingService.toggleVideo(id, userId, body.isOn);
  }

  @Post('meeting/:id/end')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT)
  async endMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.end(id, userId);
  }
}
