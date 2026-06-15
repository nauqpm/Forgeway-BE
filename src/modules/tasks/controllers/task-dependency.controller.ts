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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  TaskDependencyService,
  TaskDependencyDto,
} from '../services/task-dependency.service';
import { DependencyType } from '../schemas/task-dependency.schema';

@ApiTags('Workspace Board Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board')
export class TaskDependencyController {
  constructor(private readonly taskDependencyService: TaskDependencyService) {}

  @Get('dependencies')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List all task dependencies for this workspace' })
  async getWorkspaceDependencies(
    @Param('workspaceId') workspaceId: string,
  ): Promise<TaskDependencyDto[]> {
    return this.taskDependencyService.findByWorkspace(workspaceId);
  }

  @Get(':taskId/dependencies')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List dependencies for a specific task' })
  async getTaskDependencies(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskDependencyDto[]> {
    return this.taskDependencyService.findByTask(workspaceId, taskId);
  }

  @Post(':taskId/dependencies')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a dependency between two tasks' })
  async createDependency(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() body: { toTaskId: string; type?: DependencyType },
  ): Promise<TaskDependencyDto> {
    return this.taskDependencyService.create(
      workspaceId,
      taskId,
      body.toTaskId,
      body.type ?? 'blocks',
    );
  }

  @Delete(':taskId/dependencies/:depId')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.TASK_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task dependency' })
  async deleteDependency(
    @Param('workspaceId') workspaceId: string,
    @Param('depId') depId: string,
  ): Promise<void> {
    return this.taskDependencyService.delete(workspaceId, depId);
  }
}
