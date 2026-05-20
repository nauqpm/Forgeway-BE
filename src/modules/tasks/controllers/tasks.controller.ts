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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskAssignmentService } from '../services/task-assignment.service';
import { TaskMovementService } from '../services/task-movement.service';
import { TaskStatusService } from '../services/task-status.service';
import { TasksService } from '../services/tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly assignmentService: TaskAssignmentService,
    private readonly statusService: TaskStatusService,
    private readonly movementService: TaskMovementService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all tasks with filters and pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tasks retrieved successfully',
    type: TaskListDto,
  })
  async findAll(@Query() filterDto: FilterTaskDto): Promise<TaskListDto> {
    return this.tasksService.findAll(filterDto);
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Get task by key (e.g., PROJ-1)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task found',
    type: TaskDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Task not found',
  })
  async findByKey(@Param('key') key: string): Promise<TaskDto> {
    return this.tasksService.findByKey(key);
  }

  @Get('workspace/:workspaceId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get all tasks for a workspace' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Workspace tasks retrieved',
    type: [TaskDto],
  })
  async findByWorkspace(
    @Param('workspaceId') workspaceId: string,
  ): Promise<TaskDto[]> {
    return this.tasksService.findByWorkspace(workspaceId);
  }

  @Get('sprint/:sprintId')
  @ApiOperation({ summary: 'Get all tasks for a sprint' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sprint tasks retrieved',
    type: [TaskDto],
  })
  async findBySprint(@Param('sprintId') sprintId: string): Promise<TaskDto[]> {
    return this.tasksService.findBySprint(sprintId);
  }

  @Get('board/:boardId')
  @ApiOperation({ summary: 'Get all tasks for a board grouped by column' })
  async findByBoard(
    @Param('boardId') boardId: string,
  ): Promise<Record<string, TaskDto[]>> {
    return this.tasksService.findByBoard(boardId);
  }

  @Get('assignee/:userId')
  @ApiOperation({ summary: 'Get all tasks assigned to a user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User tasks retrieved',
    type: [TaskDto],
  })
  async findByAssignee(@Param('userId') userId: string): Promise<TaskDto[]> {
    return this.tasksService.findByAssignee(userId);
  }

  @Get(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task found',
    type: TaskDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Task not found',
  })
  async findById(@Param('id') id: string): Promise<TaskDto> {
    return this.tasksService.findById(id);
  }

  @Post('workspace/:workspaceId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new task in a workspace' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Task created successfully',
    type: TaskDto,
  })
  async createInWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() createTaskDto: CreateTaskDto,
    @Request() req: any,
  ): Promise<TaskDto> {
    return this.tasksService.create(
      { ...createTaskDto, workspaceId },
      req.user.userId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new task (uses user default workspace)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Task created successfully',
    type: TaskDto,
  })
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @Request() req: any,
  ): Promise<TaskDto> {
    return this.tasksService.create(createTaskDto, req.user.userId);
  }

  @Put(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task updated successfully',
    type: TaskDto,
  })
  async update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.SPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Task deleted successfully',
  })
  async delete(@Param('id') id: string): Promise<void> {
    await this.tasksService.delete(id);
  }

  @Put(':id/assign')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Assign task to a user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task assigned successfully',
    type: TaskDto,
  })
  async assignTo(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ): Promise<TaskDto> {
    return this.assignmentService.assignTo(id, userId);
  }

  @Put(':id/unassign')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Unassign task from user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task unassigned successfully',
    type: TaskDto,
  })
  async unassign(@Param('id') id: string): Promise<TaskDto> {
    return this.assignmentService.unassign(id);
  }

  @Put(':id/status')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Change task status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task status changed successfully',
    type: TaskDto,
  })
  async changeStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ): Promise<TaskDto> {
    return this.statusService.changeStatus(id, status);
  }

  @Put(':id/move')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Move task to a different board/column' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task moved successfully',
    type: TaskDto,
  })
  async moveToBoard(
    @Param('id') id: string,
    @Body('boardId') boardId: string,
    @Body('columnId') columnId: string,
  ): Promise<TaskDto> {
    return this.movementService.moveToBoard(id, boardId, columnId);
  }
}
