import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { TasksService } from '../services/tasks.service';
import { CreateTaskDto, UpdateTaskDto, FilterTaskDto } from '../dtos/create-task.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) { }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách task theo bộ lọc' })
  @ApiResponse({ status: 200, description: 'Danh sách task', schema: { example: { data: [{ _id: '...', title: 'Task A', status: 'todo', key: 'PROJ-1' }] } } })
  async findAll(@Query() filterDto: FilterTaskDto) {
    // Note: Filtering by workspaceId should be handled within the service/guard if possible
    return this.tasksService.findAll(filterDto);
  }

  @Get(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy task theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin task', schema: { example: { _id: '...', title: 'Task A', status: 'todo', key: 'PROJ-1', assignee: '...' } } })
  async findById(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Lấy task theo key (ví dụ: PROJ-1)' })
  @ApiResponse({ status: 200, description: 'Thông tin task', schema: { example: { _id: '...', title: 'Task A', key: 'PROJ-1' } } })
  async findByKey(@Param('key') key: string) {
    // Note: This might need a specialized guard or check since we don't have the ID initially
    return this.tasksService.findByKey(key);
  }

  @Post()
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Tạo task mới' })
  @ApiResponse({ status: 201, description: 'Tạo task thành công', schema: { example: { _id: '...', title: 'Task A', status: 'todo', key: 'PROJ-1' } } })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    return this.tasksService.create(createTaskDto, req.user.userId);
  }

  @Put(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Cập nhật task' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công', schema: { example: { _id: '...', title: 'Updated Task', status: 'in_progress' } } })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Xóa task' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  async delete(@Param('id') id: string) {
    return this.tasksService.delete(id);
  }

  @Put(':id/move')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Di chuyển task sang board/column khác' })
  @ApiResponse({ status: 200, description: 'Di chuyển thành công' })
  async moveToBoard(
    @Param('id') id: string,
    @Body('boardId') boardId: string,
    @Body('columnId') columnId: string,
  ) {
    return this.tasksService.moveToBoard(id, boardId, columnId);
  }

  @Put(':id/assign')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Gán task cho người dùng' })
  @ApiResponse({ status: 200, description: 'Gán thành công' })
  async assignTo(@Param('id') id: string, @Body('userId') userId: string) {
    return this.tasksService.assignTo(id, userId);
  }

  @Put(':id/status')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Thay đổi trạng thái task' })
  @ApiResponse({ status: 200, description: 'Thay đổi thành công' })
  async changeStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.tasksService.changeStatus(id, status);
  }

  @Put(':id/labels')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Cập nhật nhãn cho task' })
  @ApiResponse({ status: 200, description: 'Cập nhật nhãn thành công' })
  async updateLabels(@Param('id') id: string, @Body('labels') labels: string[]) {
    const task = await this.tasksService.findById(id);

    for (const label of labels) {
      if (!task.labels.includes(label)) {
        await this.tasksService.addLabel(id, label);
      }
    }

    for (const existingLabel of task.labels) {
      if (!labels.includes(existingLabel)) {
        await this.tasksService.removeLabel(id, existingLabel);
      }
    }

    return this.tasksService.findById(id);
  }

  @Put(':id/attachments')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Thêm file đính kèm vào task' })
  @ApiResponse({ status: 200, description: 'Thêm thành công' })
  async addAttachment(
    @Param('id') id: string,
    @Body('attachment') attachment: any,
  ) {
    return this.tasksService.addAttachment(id, attachment);
  }

  @Delete(':id/attachments/:attachmentId')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Xóa file đính kèm khỏi task' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.tasksService.removeAttachment(id, attachmentId);
  }

  @Get('workspace/:workspaceId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Lấy tất cả task của workspace' })
  @ApiResponse({ status: 200, description: 'Danh sách task theo workspace' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.tasksService.findByWorkspace(workspaceId);
  }

  @Get('sprint/:sprintId')
  @ApiOperation({ summary: 'Lấy tất cả task của sprint' })
  @ApiResponse({ status: 200, description: 'Danh sách task theo sprint' })
  async findBySprint(@Param('sprintId') sprintId: string) {
    // Note: Sprint access check could be added if sprints have workspaceId
    return this.tasksService.findBySprint(sprintId);
  }

  @Get('board/:boardId')
  @ApiOperation({ summary: 'Lấy task của board theo nhóm column' })
  @ApiResponse({ status: 200, description: 'Danh sách task theo board' })
  async findByBoard(@Param('boardId') boardId: string) {
    // Note: Board access check could be added if boards have workspaceId
    return this.tasksService.findByBoard(boardId);
  }

  @Get('assignee/:userId')
  @ApiOperation({ summary: 'Lấy tất cả task được gán cho người dùng' })
  @ApiResponse({ status: 200, description: 'Danh sách task theo người dùng' })
  async findByAssignee(@Param('userId') userId: string) {
    return this.tasksService.findByAssignee(userId);
  }
}
