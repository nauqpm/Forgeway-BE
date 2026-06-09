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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChannelsService } from '../services/channels.service';
import { MessagesService } from '../services/messages.service';
import { MeetingService } from '../services/meeting.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { EditMessageDto } from '../dtos/edit-message.dto';
import { CursorPaginationDto } from '../dtos/cursor-pagination.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly messagesService: MessagesService,
    private readonly meetingService: MeetingService,
  ) {}

  @Get('channels')
  async getUserChannels(@CurrentUser('userId') userId: string) {
    return this.channelsService.findByUser(userId);
  }

  @Get('channels/:id')
  async getChannelDetails(@Param('id') id: string) {
    return this.channelsService.findById(id);
  }

  @Get('channels/:id/messages')
  async getMessages(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Query() dto: CursorPaginationDto,
  ) {
    return this.messagesService.findByChannel(id, userId, dto);
  }

  @Post('channels/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(id, userId, dto);
  }

  @Patch('messages/:id')
  async editMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.edit(id, userId, dto.content);
  }

  @Delete('messages/:id')
  async deleteMessage(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.messagesService.softDelete(id, userId);
  }

  @Post('messages/:id/reactions')
  async toggleReaction(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { emoji: string },
  ) {
    // This method needs to be implemented in MessagesService
    return this.messagesService.toggleReaction(id, userId, body.emoji);
  }

  @Post('channels/:id/meeting')
  async createMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.create(id, userId);
  }

  @Get('channels/:id/meeting')
  async getActiveMeeting(@Param('id') id: string) {
    return this.meetingService.findActive(id);
  }

  @Post('meeting/:id/join')
  async joinMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.join(id, userId);
  }

  @Post('meeting/:id/leave')
  async leaveMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.leave(id, userId);
  }

  @Patch('meeting/:id/audio')
  async toggleAudio(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { isOn: boolean },
  ) {
    return this.meetingService.toggleAudio(id, userId, body.isOn);
  }

  @Patch('meeting/:id/video')
  async toggleVideo(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { isOn: boolean },
  ) {
    return this.meetingService.toggleVideo(id, userId, body.isOn);
  }

  @Post('meeting/:id/end')
  async endMeeting(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingService.end(id, userId);
  }
}
