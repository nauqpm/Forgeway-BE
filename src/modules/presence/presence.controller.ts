import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PresenceQueryService,
  PresenceEntry,
} from './services/presence-query.service';
import { PresenceService } from './services/presence.service';
import { GetPresenceDto } from './dto/get-presence.dto';
import { ToggleInvisibleDto } from './dto/toggle-invisible.dto';
import { PresenceConfig } from './presence.config';
import { Types } from 'mongoose';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(
    private readonly queryService: PresenceQueryService,
    private readonly presenceService: PresenceService,
    private readonly config: PresenceConfig,
  ) {}

  @Post('invisible')
  async toggleInvisible(
    @Request() req: any,
    @Body() dto: ToggleInvisibleDto,
  ): Promise<{ success: boolean }> {
    const userId = req.user.userId;
    await this.presenceService.setInvisible(userId, dto.invisible);
    return { success: true };
  }

  @Get('me')
  async getMyPresence(@Request() req: any): Promise<PresenceEntry> {
    const userId = req.user.userId;
    return this.queryService.getPresence(userId, userId);
  }

  @Get()
  async getBatchPresence(
    @Request() req: any,
    @Query() query: GetPresenceDto,
  ): Promise<PresenceEntry[]> {
    const viewerId = req.user.userId;
    const rawIds = Array.isArray(query.ids) ? query.ids.join(',') : query.ids;
    const ids = rawIds
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (ids.length === 0) {
      throw new BadRequestException('No valid ids provided');
    }

    if (ids.length > this.config.batchMaxIds) {
      throw new BadRequestException(
        `Too many ids requested (max ${this.config.batchMaxIds})`,
      );
    }

    for (const id of ids) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid ObjectId: ${id}`);
      }
    }

    return this.queryService.getBatchPresence(ids, viewerId);
  }
}
