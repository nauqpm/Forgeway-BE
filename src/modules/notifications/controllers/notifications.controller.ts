import {
  Body,
  Controller,
  Delete,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import {
  RemoveWebPushSubscriptionDto,
  UpsertWebPushSubscriptionDto,
} from '../dtos/web-push-subscription.dto';
import { NotificationsService } from '../services/notifications.service';
import { WebPushSubscriptionsService } from '../services/web-push-subscriptions.service';

type AuthenticatedRequest = Request & {
  user?: { userId: string; email?: string; role?: string };
};

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly webPushSubscriptionsService: WebPushSubscriptionsService,
  ) {}

  @Post('push-subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register current browser for push notifications' })
  async upsertPushSubscription(
    @Req() req: AuthenticatedRequest,
    @Body() subscription: UpsertWebPushSubscriptionDto,
  ): Promise<void> {
    await this.webPushSubscriptionsService.upsertForUser(
      req.user!.userId,
      subscription,
    );
  }

  @Delete('push-subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove current browser push subscription' })
  async removePushSubscription(
    @Req() req: AuthenticatedRequest,
    @Body() subscription: RemoveWebPushSubscriptionDto,
  ): Promise<void> {
    await this.webPushSubscriptionsService.removeForUser(
      req.user!.userId,
      subscription.endpoint,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List current user notifications' })
  @ApiResponse({ status: 200, description: 'Returns paginated notifications' })
  async listMyNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.listForUser(req.user!.userId, page, limit);
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
