import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { ScopedRoleGuard } from '@/common/guards/scoped-role.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { InviteService } from '../services/invite.service';
import { CreateInviteDto } from '../dtos/create-invite.dto';

@Controller('workspaces')
@UseFilters(AllExceptionsFilter)
@UseInterceptors(TransformInterceptor)
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Post(':id/invites')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  createInvite(
    @Param('id') workspaceId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateInviteDto,
  ) {
    return this.inviteService.createInvite(workspaceId, user.userId, dto);
  }

  @Get(':id/invites')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  getInvites(@Param('id') workspaceId: string) {
    return this.inviteService.getInvites(workspaceId);
  }

  @Delete(':id/invites/:inviteId')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  cancelInvite(
    @Param('id') workspaceId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.inviteService.cancelInvite(workspaceId, inviteId);
  }

  @Get('invites/:token')
  getInviteByToken(@Param('token') token: string) {
    return this.inviteService.getInviteByToken(token);
  }

  @Post('invites/:token/accept')
  @UseGuards(JwtAuthGuard)
  acceptInvite(@Param('token') token: string, @CurrentUser() user: any) {
    return this.inviteService.acceptInvite(token, user.userId, user.email);
  }
}
