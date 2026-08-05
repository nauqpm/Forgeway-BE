import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationsService } from '../services/notifications.service';

type AuthenticatedRequest = Request & {
  user?: { userId: string; email?: string; role?: string };
};

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user notifications' })
  @ApiResponse({ status: 200, description: 'Returns paginated notifications' })
  async listMyNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('category') category?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const isUnreadOnly = unreadOnly === 'true';
    return this.notificationsService.listForUser(
      req.user!.userId,
      cursor,
      isUnreadOnly,
      category,
      limit,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get current user unread notification count' })
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user!.userId);
  }

  @Get('unread/count')
  @ApiOperation({ summary: 'Get current user unread notification count' })
  async getUnreadCountLegacy(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user!.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get current user notification by ID' })
  async getById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notificationsService.findByIdForUser(req.user!.userId, id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markAsRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user!.userId, id);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markAsReadLegacy(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(req.user!.userId, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user!.userId);
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  async markAllAsReadLegacy(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user!.userId);
  }
}
