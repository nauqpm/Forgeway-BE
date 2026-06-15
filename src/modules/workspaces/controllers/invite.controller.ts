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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { ScopedRoleGuard } from '@/common/guards/scoped-role.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { InviteService } from '../services/invite.service';
import { CreateInviteDto } from '../dtos/create-invite.dto';
import { CreateInviteLinkDto } from '../dtos/create-invite-link.dto';

@ApiTags('Workspaces - Invites')
@Controller('workspaces')
@UseFilters(AllExceptionsFilter)
@UseInterceptors(TransformInterceptor)
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @ApiOperation({ summary: 'Tạo lời mời tham gia workspace' })
  @ApiParam({ name: 'id', description: 'ID của workspace', type: String })
  @ApiBody({ type: CreateInviteDto })
  @ApiBearerAuth()
  @Post(':id/invites')
  @UseGuards(
    JwtAuthGuard,
    ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN),
  )
  createInvite(
    @Param('id') workspaceId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateInviteDto,
  ) {
    return this.inviteService.createInvite(workspaceId, user.userId, dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách lời mời của workspace' })
  @ApiParam({ name: 'id', description: 'ID của workspace', type: String })
  @ApiOperation({ summary: 'Tao link moi tham gia workspace' })
  @ApiParam({ name: 'id', description: 'ID cua workspace', type: String })
  @ApiBody({ type: CreateInviteLinkDto })
  @ApiBearerAuth()
  @Post(':id/invites/link')
  @UseGuards(
    JwtAuthGuard,
    ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN),
  )
  createInviteLink(
    @Param('id') workspaceId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateInviteLinkDto,
  ) {
    return this.inviteService.createInviteLink(workspaceId, user.userId, dto);
  }

  @ApiBearerAuth()
  @Get(':id/invites')
  @UseGuards(
    JwtAuthGuard,
    ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN),
  )
  getInvites(@Param('id') workspaceId: string) {
    return this.inviteService.getInvites(workspaceId);
  }

  @ApiOperation({ summary: 'Hủy lời mời' })
  @ApiParam({ name: 'id', description: 'ID của workspace', type: String })
  @ApiParam({ name: 'inviteId', description: 'ID của lời mời', type: String })
  @ApiBearerAuth()
  @Delete(':id/invites/:inviteId')
  @UseGuards(
    JwtAuthGuard,
    ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN),
  )
  cancelInvite(
    @Param('id') workspaceId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.inviteService.cancelInvite(workspaceId, inviteId);
  }

  @ApiOperation({ summary: 'Get authenticated invite detail by invite id' })
  @ApiParam({ name: 'inviteId', description: 'Invite id', type: String })
  @ApiBearerAuth()
  @Get('invites/id/:inviteId')
  @UseGuards(JwtAuthGuard)
  getInviteById(@Param('inviteId') inviteId: string, @CurrentUser() user: any) {
    return this.inviteService.getInviteByIdForUser(
      inviteId,
      user.userId,
      user.email,
    );
  }
  @ApiOperation({ summary: 'Accept authenticated invite by invite id' })
  @ApiParam({ name: 'inviteId', description: 'Invite id', type: String })
  @ApiBearerAuth()
  @Post('invites/id/:inviteId/accept')
  @UseGuards(JwtAuthGuard)
  acceptInviteById(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: any,
  ) {
    return this.inviteService.acceptInviteByIdForUser(
      inviteId,
      user.userId,
      user.email,
    );
  }

  @ApiOperation({ summary: 'Decline authenticated invite by invite id' })
  @ApiParam({ name: 'inviteId', description: 'Invite id', type: String })
  @ApiBearerAuth()
  @Post('invites/id/:inviteId/decline')
  @UseGuards(JwtAuthGuard)
  declineInviteById(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: any,
  ) {
    return this.inviteService.declineInviteByIdForUser(
      inviteId,
      user.userId,
      user.email,
    );
  }
  @ApiOperation({ summary: 'Lấy thông tin lời mời bằng token' })
  @ApiParam({ name: 'token', description: 'Token của lời mời', type: String })
  @Get('invites/:token')
  getInviteByToken(@Param('token') token: string) {
    return this.inviteService.getInviteByToken(token);
  }

  @ApiOperation({ summary: 'Chấp nhận lời mời' })
  @ApiParam({ name: 'token', description: 'Token của lời mời', type: String })
  @ApiBearerAuth()
  @Post('invites/:token/accept')
  @UseGuards(JwtAuthGuard)
  acceptInvite(@Param('token') token: string, @CurrentUser() user: any) {
    return this.inviteService.acceptInvite(token, user.userId, user.email);
  }
}
