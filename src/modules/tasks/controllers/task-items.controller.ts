import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  AssignTaskDto,
  ChangeTaskStatusDto,
  MoveTaskToKanbanColumnDto,
} from '../dtos/requests/task-action.dto';
import { UpdateTaskDto } from '../dtos/requests/update-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TasksFacadeService } from '../services/tasks-facade.service';

@ApiTags('Task Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskItemsController {
  constructor(private readonly tasksFacade: TasksFacadeService) {}

  @Get('key/:key')
  @ApiOperation({ summary: 'Get task by key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task found',
    type: TaskDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findByKey(@Param('key') key: string): Promise<TaskDto> {
    return this.tasksFacade.findByKey(key);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task found',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task access denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async findById(@Param('id') id: string): Promise<TaskDto> {
    return this.tasksFacade.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task updated successfully',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid task update payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task update denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.tasksFacade.update(id, updateTaskDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.WORKSPACE_ADMIN))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Task deleted successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace admin role required' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.tasksFacade.delete(id);
  }

  @Patch(':id/assignment')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Assign task to a user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task assigned successfully',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid assignee payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task assignment denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async assignTo(
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ): Promise<TaskDto> {
    return this.tasksFacade.assignTo(id, dto.userId);
  }

  @Delete(':id/assignment')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Unassign task' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task unassigned successfully',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid task ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task assignment denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async unassign(@Param('id') id: string): Promise<TaskDto> {
    return this.tasksFacade.unassign(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Change task status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task status changed successfully',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid status payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task status update denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeTaskStatusDto,
  ): Promise<TaskDto> {
    return this.tasksFacade.changeStatus(id, dto.status);
  }

  @Patch(':id/kanban-position')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Move task to a Kanban column' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Task moved successfully',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid Kanban movement payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Task movement denied' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async moveToKanbanColumn(
    @Param('id') id: string,
    @Body() dto: MoveTaskToKanbanColumnDto,
  ): Promise<TaskDto> {
    return this.tasksFacade.moveToKanbanColumn(
      id,
      dto.kanbanBoardId,
      dto.columnId,
    );
  }
}
