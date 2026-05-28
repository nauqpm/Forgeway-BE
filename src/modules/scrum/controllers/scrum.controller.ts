import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceTypeGuard } from '../../../common/guards/workspace-type.guard';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import {
  CompleteSprintDto,
  CreateSprintDto,
  MoveTasksToSprintDto,
  StartSprintDto,
  UpdateSprintDto,
} from '../dtos/sprint.dto';
import { ScrumService } from '../services/scrum.service';

@ApiTags('Workspaces - Scrum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceTypeGuard('scrum'))
@Controller('workspaces/:key')
export class ScrumController {
  constructor(
    private readonly scrumService: ScrumService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Post('sprints')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Tạo sprint mới' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  async createSprint(
    @Param('key') key: string,
    @Body() dto: CreateSprintDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.createSprint(workspace._id.toString(), dto);
  }

  @Get('sprints')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy tất cả các sprint trong workspace' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  async findByWorkspace(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.findByWorkspace(workspace._id.toString());
  }

  @Patch('sprints/:sprintId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Cập nhật tên/goal/ngày của sprint (chỉ khi ở trạng thái lên kế hoạch)' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async updateSprint(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: UpdateSprintDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.updateSprint(workspace._id.toString(), sprintId, dto);
  }

  @Delete('sprints/:sprintId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa một sprint (chỉ khi ở trạng thái lên kế hoạch)' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async deleteSprint(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    await this.scrumService.deleteSprint(workspace._id.toString(), sprintId);
  }

  @Post('sprints/:sprintId/start')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bắt đầu một sprint' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async startSprint(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: StartSprintDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.startSprint(workspace._id.toString(), sprintId, dto);
  }

  @Post('sprints/:sprintId/complete')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hoàn thành một sprint' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async completeSprint(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: CompleteSprintDto,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.completeSprint(workspace._id.toString(), sprintId, dto);
  }

  @Get('backlog')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy backlog của workspace' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiQuery({
    name: 'grouped',
    required: false,
    type: Boolean,
    description: 'Gom nhóm các mục backlog theo priority/status nếu service hỗ trợ',
  })
  async getBacklog(
    @Param('key') key: string,
    @Query('grouped') grouped?: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.getBacklog(
      workspace._id.toString(),
      grouped === 'true',
    );
  }

  @Get('active-sprint')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy sprint đang hoạt động cho workspace' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  async getActiveSprint(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.getActiveSprint(workspace._id.toString());
  }

  @Post('sprints/:sprintId/tasks')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Di chuyển tasks/issues vào sprint' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async moveTasksToSprint(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
    @Body() dto: MoveTasksToSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.moveTasksToSprint(
      workspace._id.toString(),
      sprintId,
      dto.taskIds,
      user.role === 'super_admin',
    );
  }

  @Post('backlog/tasks')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Di chuyển tasks/issues về backlog' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  async moveTasksToBacklog(
    @Param('key') key: string,
    @Body() dto: MoveTasksToSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.moveTasksToBacklog(
      workspace._id.toString(),
      dto.taskIds,
      user.role === 'super_admin',
    );
  }

  @Get('sprints/:sprintId/tasks')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy tasks trong sprint' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async getSprintTasks(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.getSprintTasks(workspace._id.toString(), sprintId);
  }

  @Get('sprints/:sprintId/complete-preview')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy bản xem trước khi hoàn thành sprint' })
  @ApiParam({ name: 'key', description: 'Workspace key' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  async getCompleteSprintPreview(
    @Param('key') key: string,
    @Param('sprintId', ParseObjectIdPipe) sprintId: string,
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    return this.scrumService.getCompleteSprintPreview(
      workspace._id.toString(),
      sprintId,
    );
  }
}
