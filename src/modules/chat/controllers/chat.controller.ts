import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ChatService } from '../services/chat.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateChannelDto } from '../dtos/create-channel.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('default')
  async getDefaultChannel() {
    return this.chatService.getDefaultChannel();
  }

  @Post('channels')
  async createChannel(@CurrentUser('userId') userId: string, @Body() dto: CreateChannelDto) {
    return this.chatService.createChannel(userId, dto);
  }

  @Get('channels')
  async getUserChannels(@CurrentUser('userId') userId: string) {
    return this.chatService.getUserChannels(userId);
  }

  @Get('messages/:channelId')
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: string,
  ) {
    return this.chatService.getMessages(channelId, limit ? Number(limit) : 50, before);
  }
}
