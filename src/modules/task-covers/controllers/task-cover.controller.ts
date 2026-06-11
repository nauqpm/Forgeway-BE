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
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { SetTaskCoverDto } from '../dtos/set-task-cover.dto';
import { TaskCoverDto } from '../dtos/task-cover.dto';
import { TaskCoverService } from '../services/task-cover.service';

@ApiTags('Task Covers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board/:taskId/cover')
export class TaskCoverController {
  constructor(private readonly taskCoverService: TaskCoverService) {}

  @Get()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get task cover' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskCoverDto })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  async getTaskCover(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskCoverDto | null> {
    return this.taskCoverService.getCover(workspaceId, taskId, user.userId);
  }

  @Patch()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Set task cover' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskCoverDto })
  @ApiBadRequestResponse({
    description: 'Invalid cover payload or archived task is read-only',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  async setTaskCover(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: SetTaskCoverDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskCoverDto> {
    return this.taskCoverService.setCover(
      workspaceId,
      taskId,
      dto,
      user.userId,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Remove task cover' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({ description: 'Archived task cover is read-only' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  async removeTaskCover(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.taskCoverService.removeCover(workspaceId, taskId, user.userId);
  }
}
