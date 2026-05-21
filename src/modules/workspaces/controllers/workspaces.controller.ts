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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Lấy tất cả workspace của người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách workspace', schema: { example: [{ _id: '...', name: 'My Workspace', owner: '...' }] } })
  async findAll(@Request() req: any) {
    return this.workspacesService.findByUserId(req.user.userId);
  }

  @Get(':id')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy workspace theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin workspace', schema: { example: { _id: '...', name: 'My Workspace', members: [] } } })
  async findOne(@Param('id') id: string) {
    const workspace = await this.workspacesService.findById(id);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }
    return workspace;
  }

  @Post()
  @ApiOperation({ summary: 'Tạo workspace mới' })
  @ApiResponse({ status: 201, description: 'Tạo workspace thành công', schema: { example: { _id: '...', name: 'New Workspace' } } })
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: any, @Body() dto: CreateWorkspaceDto) {
    console.log('📥 Nhận yêu cầu tạo Workspace:', JSON.stringify(dto));
    return this.workspacesService.create(req.user.userId, dto);
  }

  @Put(':id')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Cập nhật workspace' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa workspace' })
  @ApiResponse({ status: 204, description: 'Xóa thành công' })
  async remove(@Param('id') id: string) {
    await this.workspacesService.delete(id);
  }

  @Get(':id/members')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy danh sách thành viên workspace' })
  @ApiResponse({ status: 200, description: 'Danh sách thành viên', schema: { example: [{ userId: '...', email: 'user@example.com', role: 'member' }] } })
  async getMembers(@Param('id') id: string) {
    return this.workspacesService.getMembers(id);
  }

  @Post(':id/members')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Thêm thành viên vào workspace' })
  @ApiResponse({ status: 201, description: 'Thêm thành viên thành công' })
  async addMember(
    @Param('id') id: string,
    @Body() body: { email: string; role: SpaceRole },
  ) {
    return this.workspacesService.addMember(id, body.email, body.role);
  }

  @Put(':id/members/:userId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Cập nhật vai trò thành viên' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: SpaceRole },
  ) {
    return this.workspacesService.updateMemberRole(id, userId, body.role);
  }

  @Delete(':id/members/:userId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa thành viên khỏi workspace' })
  @ApiResponse({ status: 204, description: 'Xóa thành công' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.workspacesService.removeMember(id, userId);
  }
}
