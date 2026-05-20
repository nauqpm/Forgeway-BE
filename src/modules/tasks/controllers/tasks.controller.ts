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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tasks with filters' })
  async findAll(@Query() filterDto: FilterTaskDto) {
    // Note: Filtering by workspaceId should be handled within the service/guard if possible
    return this.tasksService.findAll(filterDto);
  }

  @Get(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task by ID' })
  async findById(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Get task by key (e.g., PROJ-1)' })
  async findByKey(@Param('key') key: string) {
    // Note: This might need a specialized guard or check since we don't have the ID initially
    return this.tasksService.findByKey(key);
  }

  @Post()
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    return this.tasksService.create(createTaskDto, req.user.userId);
  }

  @Put(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Delete a task' })
  async delete(@Param('id') id: string) {
    return this.tasksService.delete(id);
  }

  @Put(':id/move')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Move task to a different board/column' })
  async moveToBoard(
    @Param('id') id: string,
    @Body('boardId') boardId: string,
    @Body('columnId') columnId: string,
  ) {
    return this.tasksService.moveToBoard(id, boardId, columnId);
  }

  @Put(':id/assign')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Assign task to a user' })
  async assignTo(@Param('id') id: string, @Body('userId') userId: string) {
    return this.tasksService.assignTo(id, userId);
  }

  @Put(':id/status')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Change task status' })
  async changeStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.tasksService.changeStatus(id, status);
  }

  @Put(':id/labels')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update task labels' })
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
  @ApiOperation({ summary: 'Add attachment to task' })
  async addAttachment(
    @Param('id') id: string,
    @Body('attachment') attachment: any,
  ) {
    return this.tasksService.addAttachment(id, attachment);
  }

  @Delete(':id/attachments/:attachmentId')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Remove attachment from task' })
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.tasksService.removeAttachment(id, attachmentId);
  }

  @Get('workspace/:workspaceId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get all tasks for a workspace' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.tasksService.findByWorkspace(workspaceId);
  }

  @Get('sprint/:sprintId')
  @ApiOperation({ summary: 'Get all tasks for a sprint' })
  async findBySprint(@Param('sprintId') sprintId: string) {
    // Note: Sprint access check could be added if sprints have workspaceId
    return this.tasksService.findBySprint(sprintId);
  }

  @Get('board/:boardId')
  @ApiOperation({ summary: 'Get all tasks for a board grouped by column' })
  async findByBoard(@Param('boardId') boardId: string) {
    // Note: Board access check could be added if boards have workspaceId
    return this.tasksService.findByBoard(boardId);
  }

  @Get('assignee/:userId')
  @ApiOperation({ summary: 'Get all tasks assigned to a user' })
  async findByAssignee(@Param('userId') userId: string) {
    return this.tasksService.findByAssignee(userId);
  }
}
