import { Controller, Get, HttpStatus, Param, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskDto } from '../dtos/responses/task.dto';
import { TasksFacadeService } from '../services/tasks-facade.service';

export class BaseTaskScopeController {
  constructor(protected readonly tasksFacade: TasksFacadeService) {}
}

@ApiTags('Sprint Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sprints/:sprintId/tasks')
export class SprintTasksController extends BaseTaskScopeController {
  @Get()
  @ApiOperation({ summary: 'Get tasks in a sprint' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sprint tasks retrieved',
    type: [TaskDto],
  })
  @ApiBadRequestResponse({ description: 'Invalid sprint ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async findBySprint(@Param('sprintId') sprintId: string): Promise<TaskDto[]> {
    return this.tasksFacade.findBySprint(sprintId);
  }
}

@ApiTags('Kanban Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kanban/boards/:kanbanBoardId/tasks')
export class KanbanBoardTasksController extends BaseTaskScopeController {
  @Get()
  @ApiOperation({ summary: 'Get tasks in a Kanban board grouped by column' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Kanban board tasks retrieved',
  })
  @ApiBadRequestResponse({ description: 'Invalid Kanban board ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async findByKanbanBoard(
    @Param('kanbanBoardId') kanbanBoardId: string,
  ): Promise<Record<string, TaskDto[]>> {
    return this.tasksFacade.findByKanbanBoard(kanbanBoardId);
  }
}

@ApiTags('User Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/:userId/tasks')
export class UserTasksController extends BaseTaskScopeController {
  @Get('assigned')
  @ApiOperation({ summary: 'Get tasks assigned to a user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assigned tasks retrieved',
    type: [TaskDto],
  })
  @ApiBadRequestResponse({ description: 'Invalid user ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async findByAssignee(@Param('userId') userId: string): Promise<TaskDto[]> {
    return this.tasksFacade.findByAssignee(userId);
  }
}
