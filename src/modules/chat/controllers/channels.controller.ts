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
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { ChannelsService } from '../services/channels.service';
import { MessagesService } from '../services/messages.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { EditMessageDto } from '../dtos/edit-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';
import { CHAT_THROTTLE_CONFIG } from '../constants/chat-throttler.constants';
import { MeetingService } from '@/modules/meetings/services/meeting.service';

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
  async getUserChannels(
    @CurrentUser('userId') userId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    if (workspaceId) {
      return this.channelsService.findWorkspaceCustomChannels(workspaceId, userId);
    }
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
  async openDM(
    @CurrentUser('userId') userId: string,
    @Body() body: { targetUserId: string },
  ) {
    return this.channelsService.getOrCreateDM(userId, body.targetUserId);
  }

  @Get('users/search')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async searchUsers(
    @CurrentUser('userId') userId: string,
    @Query('q') query: string,
  ) {
    return this.channelsService.searchUsers(query || '', userId);
  }

  @Get(':id')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getChannelDetails(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.channelsService.getChannelDetailsForUser(id, userId);
  }

  @Get('channels/:id/mention-members')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @SkipThrottle()
  async getMentionMembers(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Query('q') query?: string,
  ) {
    return this.channelsService.searchMentionMembers(id, query || '', userId);
  }

  @Get('channels/:id/members')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getChannelMembers(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.channelsService.getChannelMembers(id, userId);
  }

  @Post('channels/:id/read')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
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

  @Get('channels/:channelId/messages/:messageId/replies')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getThreadReplies(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messagesService.findThreadReplies(channelId, messageId, userId);
  }

  @Get('channels/:channelId/threads')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.API_QUERY)
  async getActiveThreads(
    @Param('channelId') channelId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messagesService.findActiveThreads(channelId, userId);
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
  async deleteMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
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

  // ==========================================
  // CUSTOM CHANNELS API
  // ==========================================

  @Post('channels')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async createCustomChannel(
    @CurrentUser('userId') userId: string,
    @Body() body: { name: string; workspaceId: string; isPrivate?: boolean; description?: string },
  ) {
    return this.channelsService.createCustomChannel(body.workspaceId, userId, body);
  }

  @Patch('channels/:id')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async updateCustomChannel(
    @Param('id') channelId: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { name?: string; description?: string; isPrivate?: boolean },
  ) {
    return this.channelsService.updateCustomChannel(channelId, body, userId);
  }

  @Delete('channels/:id')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async deleteCustomChannel(
    @Param('id') channelId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.channelsService.deleteCustomChannel(channelId, userId);
    return { ok: true };
  }

  @Post('channels/:id/join')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async joinChannel(
    @Param('id') channelId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.channelsService.joinChannel(channelId, userId);
  }

  @Post('channels/:id/leave')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async leaveChannel(
    @Param('id') channelId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.channelsService.leaveChannel(channelId, userId);
  }

  @Post('channels/:id/invite')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async inviteMembers(
    @Param('id') channelId: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { userIds: string[] },
  ) {
    return this.channelsService.inviteMembers(channelId, body.userIds, userId);
  }

  @Delete('channels/:id/members/:userId')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async kickMember(
    @Param('id') channelId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.channelsService.kickMember(channelId, targetUserId, userId);
  }

  @Patch('channels/:id/members/:userId')
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Throttle(CHAT_THROTTLE_CONFIG.MESSAGE_ACTION)
  async updateMemberRole(
    @Param('id') channelId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { role: 'channel_admin' | 'channel_member' },
  ) {
    return this.channelsService.updateMemberRole(channelId, targetUserId, body.role, userId);
  }
}
