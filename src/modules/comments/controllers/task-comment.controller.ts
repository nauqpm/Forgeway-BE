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
import { CommentDto } from '../dtos/comment.dto';
import { CreateTaskCommentDto } from '../dtos/create-task-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { TaskCommentService } from '../services/task-comment.service';

@ApiTags('Task Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/board/:taskId/comments')
export class TaskCommentController {
  constructor(private readonly taskCommentService: TaskCommentService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Create a comment on a task' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CommentDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or archived task is read-only',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({
    description: 'Workspace, task, or parent comment not found',
  })
  async createTaskComment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CommentDto> {
    return this.taskCommentService.createForTask(
      workspaceId,
      taskId,
      dto,
      user.userId,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List task comments' })
  @ApiResponse({ status: HttpStatus.OK, type: [CommentDto] })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or task not found' })
  async getTaskComments(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CommentDto[]> {
    return this.taskCommentService.findByTask(workspaceId, taskId, user.userId);
  }

  @Patch(':commentId')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update a task comment' })
  @ApiResponse({ status: HttpStatus.OK, type: CommentDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or archived task is read-only',
  })
  @ApiForbiddenResponse({
    description: 'Workspace access denied or not comment author',
  })
  @ApiNotFoundResponse({ description: 'Workspace, task, or comment not found' })
  async updateTaskComment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CommentDto> {
    return this.taskCommentService.updateForTask(
      workspaceId,
      taskId,
      commentId,
      dto,
      user.userId,
    );
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Soft delete a task comment' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or archived task is read-only',
  })
  @ApiForbiddenResponse({
    description: 'Workspace access denied or not comment author',
  })
  @ApiNotFoundResponse({ description: 'Workspace, task, or comment not found' })
  async deleteTaskComment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.taskCommentService.deleteForTask(
      workspaceId,
      taskId,
      commentId,
      user.userId,
    );
  }
}
