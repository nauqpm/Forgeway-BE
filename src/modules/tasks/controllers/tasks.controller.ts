import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateTaskDto, FilterTaskDto } from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TasksFacadeService } from '../services/tasks-facade.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksFacade: TasksFacadeService) {}

  @Get()
  @ApiOperation({ summary: 'Search tasks with filters and pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tasks retrieved successfully',
    type: TaskListDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid task filter query' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async findAll(@Query() filterDto: FilterTaskDto): Promise<TaskListDto> {
    return this.tasksFacade.findAll(filterDto);
  }

  @Get('workspace/:workspaceId')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get tasks in a workspace' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Workspace tasks retrieved',
    type: [TaskDto],
  })
  @ApiBadRequestResponse({ description: 'Invalid workspace ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  async findByWorkspace(
    @Param('workspaceId') workspaceId: string,
  ): Promise<TaskDto[]> {
    return this.tasksFacade.findByWorkspace(workspaceId);
  }

  @Post('workspace/:workspaceId')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a task in a workspace' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Task created successfully',
    type: TaskDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid task payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Workspace membership required' })
  async createInWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskDto> {
    return this.tasksFacade.createInWorkspace(
      workspaceId,
      createTaskDto,
      user.userId,
    );
  }
}
