import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CommentService } from '../services/comment.service';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new generic comment' })
  async create(@Body() dto: CreateCommentDto, @Request() req: any) {
    return this.commentService.create(dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List generic comments' })
  @ApiQuery({ name: 'workspaceId', required: true })
  @ApiQuery({ name: 'targetType', required: true, enum: ['task', 'page'] })
  @ApiQuery({ name: 'targetId', required: true })
  async findAll(
    @Query('workspaceId') workspaceId: string,
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
    @Request() req: any,
  ) {
    return this.commentService.findByTarget(
      workspaceId,
      targetType,
      targetId,
      req.user.userId,
    );
  }

  @Get('target/:targetType/:targetId/threaded')
  @ApiOperation({ summary: 'Get all comments for a target as threads' })
  @ApiQuery({ name: 'workspaceId', required: true })
  async findByTargetThreaded(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Query('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    return this.commentService.findByTargetThreaded(
      workspaceId,
      targetType,
      targetId,
      req.user.userId,
    );
  }

  @Get('target/:targetType/:targetId')
  @ApiOperation({ summary: 'Get all comments for a target (task or page)' })
  @ApiQuery({ name: 'workspaceId', required: true })
  async findByTarget(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Query('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    return this.commentService.findByTarget(
      workspaceId,
      targetType,
      targetId,
      req.user.userId,
    );
  }

  @Get('parent/:parentId')
  @ApiOperation({ summary: 'Get replies to a comment' })
  @ApiQuery({ name: 'workspaceId', required: true })
  async findByParent(
    @Param('parentId') parentId: string,
    @Query('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    return this.commentService.findByParent(
      workspaceId,
      parentId,
      req.user.userId,
    );
  }

  @Get('count/:targetType/:targetId')
  @ApiOperation({ summary: 'Count comments for a target' })
  @ApiQuery({ name: 'workspaceId', required: true })
  async countByTarget(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Query('workspaceId') workspaceId: string,
    @Request() req: any,
  ) {
    const count = await this.commentService.countByTarget(
      workspaceId,
      targetType,
      targetId,
      req.user.userId,
    );
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  async findOne(@Param('id') id: string) {
    return this.commentService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a generic comment' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @Request() req: any,
  ) {
    return this.commentService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a generic comment' })
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.commentService.delete(id, req.user.userId);
    return { message: 'Comment deleted successfully' };
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Mark a comment thread as resolved' })
  async resolve(@Param('id') id: string, @Request() req: any) {
    return this.commentService.resolve(id, req.user.userId);
  }

  @Post(':id/unresolve')
  @ApiOperation({ summary: 'Reopen a resolved comment thread' })
  async unresolve(@Param('id') id: string, @Request() req: any) {
    return this.commentService.unresolve(id, req.user.userId);
  }
}
