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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspacesService } from '../services/workspaces.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from '../dtos/create-workspace.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotFoundException } from '@nestjs/common';
import { SPACE_ROLES, SpaceRole } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all workspaces for current user' })
  async findAll(@Request() req: any) {
    return this.workspacesService.findByUserId(req.user.userId);
  }

  @Get(':key')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace by Key' })
  async findOne(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return workspace;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: any, @Body() dto: CreateWorkspaceDto) {
    console.log('📥 Nhận yêu cầu tạo Workspace:', JSON.stringify(dto));
    return this.workspacesService.create(req.user.userId, dto);
  }

  @Put(':key')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update workspace (owner/workspace admin only)' })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.workspacesService.update(workspace._id.toString(), dto);
  }

  @Delete(':key')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete workspace (owner only)' })
  async remove(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    await this.workspacesService.delete(workspace._id.toString());
  }

  @Get(':key/members')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get workspace members' })
  async getMembers(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.workspacesService.getMembers(workspace._id.toString());
  }

  @Post(':key/members')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add member to workspace (owner/workspace admin only)' })
  async addMember(
    @Param('key') key: string,
    @Body() body: { email: string; role: SpaceRole },
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.workspacesService.addMember(workspace._id.toString(), body.email, body.role);
  }

  @Put(':key/members/:userId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update member role (owner/workspace admin only)' })
  async updateMemberRole(
    @Param('key') key: string,
    @Param('userId') userId: string,
    @Body() body: { role: SpaceRole },
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.workspacesService.updateMemberRole(workspace._id.toString(), userId, body.role);
  }

  @Delete(':key/members/:userId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove member from workspace (owner/workspace admin only)' })
  async removeMember(
    @Param('key') key: string,
    @Param('userId') userId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    await this.workspacesService.removeMember(workspace._id.toString(), userId);
  }
}
