import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import {
  CreateSubtaskDto,
  ConvertToSubtaskDto,
} from '../dtos/requests/create-subtask.dto';
import { SubtaskSummaryDto } from '../dtos/responses/task-detail.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { SubtaskService } from '../services/subtask.service';

@ApiTags('Subtasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class SubtaskController {
  constructor(private readonly subtaskService: SubtaskService) {}

  @Post('tasks/:taskId/subtasks')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a subtask under a parent task' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskDto })
  @ApiBadRequestResponse({
    description: 'Invalid subtask payload or parent is a subtask/epic',
  })
  @ApiNotFoundResponse({ description: 'Parent task not found' })
  async createSubtask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CreateSubtaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskDto> {
    return this.subtaskService.createSubtask(
      taskId,
      dto,
      user.userId,
      workspaceId,
    );
  }

  @Get('tasks/:taskId/subtasks')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @ApiOperation({ summary: 'List all subtasks of a task' })
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      type: 'object',
      properties: {
        subtasks: {
          type: 'array',
          items: { $ref: '#/components/schemas/SubtaskSummaryDto' },
        },
        progress: {
          type: 'object',
          properties: { done: { type: 'number' }, total: { type: 'number' } },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async getSubtasks(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{
    subtasks: SubtaskSummaryDto[];
    progress: { done: number; total: number };
  }> {
    return this.subtaskService.getSubtasksOfTask(
      taskId,
      workspaceId,
      user.userId,
    );
  }

  @Delete('tasks/:taskId/subtasks/:subtaskId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a subtask of a task' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({
    description: 'Task is not a subtask or does not belong to the parent',
  })
  @ApiNotFoundResponse({ description: 'Subtask not found' })
  async deleteSubtask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('subtaskId') subtaskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskDto> {
    return this.subtaskService.deleteSubtask(
      taskId,
      subtaskId,
      workspaceId,
      user.userId,
    );
  }

  @Post('tasks/:taskId/convert-to-subtask')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Convert a Task to a Subtask by specifying a parent task',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({
    description:
      'Task is Epic / has subtask children / parent is subtask / self-reference',
  })
  async convertTaskToSubtask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ConvertToSubtaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskDto> {
    return this.subtaskService.convertTaskToSubtask(
      taskId,
      dto.parentId,
      workspaceId,
      user.userId,
    );
  }

  @Post('subtasks/:subtaskId/convert-to-task')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert a Subtask back to a regular Task' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskDto })
  @ApiBadRequestResponse({ description: 'Task is not a subtask' })
  async convertSubtaskToTask(
    @Param('workspaceId') workspaceId: string,
    @Param('subtaskId') subtaskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskDto> {
    return this.subtaskService.convertSubtaskToTask(
      subtaskId,
      workspaceId,
      user.userId,
    );
  }
}
