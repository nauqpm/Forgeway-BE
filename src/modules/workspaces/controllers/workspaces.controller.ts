import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { WorkspacesService } from '../services/workspaces.service';
import { WorkspaceMemberService } from '../services/workspace-member.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
} from '../dtos/create-workspace.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  SPACE_ROLES,
  SpaceRole,
} from '../../../common/constants/space-role.constants';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { CreateInviteDto } from '../dtos/create-invite.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả workspace của người dùng hiện tại' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách workspace',
    schema: { example: [{ _id: '...', name: 'My Workspace', owner: '...' }] },
  })
  async findAll(@Request() req: any) {
    return this.workspacesService.findByUserId(req.user.userId);
  }

  // Super admin: xem tất cả workspaces
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super admin: Lấy tất cả workspaces (bao gồm cả đã xóa)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách tất cả workspaces' })
  async findAllAdmin() {
    return this.workspacesService.findAllWithDeleted();
  }

  @Get('avatar-samples')
  @ApiOperation({ summary: 'Get sample workspace avatars' })
  async getAvatarSamples() {
    return this.workspacesService.getAvatarSamples();
  }

  @Get(':workspaceId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy workspace theo ID' })
  @ApiResponse({
    status: 200,
    description: 'Thông tin workspace',
    schema: { example: { _id: '...', name: 'My Workspace', members: [] } },
  })
  async findOne(@Param('workspaceId') workspaceId: string) {
    const workspace = await this.workspacesService.findById(workspaceId);
    return workspace;
  }

  @Post()
  @ApiOperation({ summary: 'Tạo workspace mới' })
  @ApiResponse({
    status: 201,
    description: 'Tạo workspace thành công',
    schema: { example: { _id: '...', name: 'New Workspace' } },
  })
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(req.user.userId, dto);
  }

  @Put(':workspaceId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.WORKSPACE_UPDATE)
  @ApiOperation({ summary: 'Update workspace (owner/workspace admin only)' })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
    @Request() req: any,
  ) {
    return this.workspacesService.update(workspaceId, dto, req.user.userId);
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.WORKSPACE_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete workspace (owner only)' })
  async remove(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    await this.workspacesService.delete(workspaceId, req.user.userId);
  }

  @Get(':workspaceId/members')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace members' })
  async getMembers(@Param('workspaceId') workspaceId: string) {
    return this.workspaceMemberService.getMembers(workspaceId);
  }

  @Post(':workspaceId/members')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add member to workspace (owner/workspace admin only)',
  })
  @ApiBody({ type: CreateInviteDto })
  async addMember(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { email: string; role: SpaceRole },
    @Request() req: any,
  ) {
    return this.workspaceMemberService.addMember(
      workspaceId,
      body.email,
      body.role,
      req.user.userId,
    );
  }

  @Put(':workspaceId/members/:userId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update member role (owner/workspace admin only)' })
  async updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() body: { role: SpaceRole },
    @Request() req: any,
  ) {
    return this.workspaceMemberService.updateMemberRole(
      workspaceId,
      userId,
      body.role,
      req.user.userId,
    );
  }

  @Delete(':workspaceId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave workspace (any member)' })
  async leaveWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    await this.workspaceMemberService.removeMember(
      workspaceId,
      req.user.userId,
      req.user.userId,
    );
  }

  @Delete(':workspaceId/members/:userId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove member from workspace (owner/workspace admin only)',
  })
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    await this.workspaceMemberService.removeMember(
      workspaceId,
      userId,
      req.user.userId,
    );
  }

  @Post(':workspaceId/restore')
  @UseGuards(RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Restore soft-deleted workspace (super_admin only)',
  })
  async restore(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    return this.workspacesService.restore(workspaceId, req.user.userId);
  }

  @Post(':workspaceId/archive')
  @UseGuards(RolesGuard)
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Archive workspace (super_admin only)' })
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    return this.workspacesService.archive(workspaceId, req.user.userId);
  }
}
