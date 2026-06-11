import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
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
  @ApiQuery({ name: 'targetType', required: true, enum: ['task', 'page'] })
  @ApiQuery({ name: 'targetId', required: true })
  async findAll(@Query('targetType') targetType: string, @Query('targetId') targetId: string) {
    return this.commentService.findByTarget(targetType, targetId);
  }

  @Get('target/:targetType/:targetId/threaded')
  @ApiOperation({ summary: 'Get all comments for a target as threads' })
  async findByTargetThreaded(@Param('targetType') targetType: string, @Param('targetId') targetId: string) {
    return this.commentService.findByTargetThreaded(targetType, targetId);
  }

  @Get('target/:targetType/:targetId')
  @ApiOperation({ summary: 'Get all comments for a target (task or page)' })
  async findByTarget(@Param('targetType') targetType: string, @Param('targetId') targetId: string) {
    return this.commentService.findByTarget(targetType, targetId);
  }

  @Get('parent/:parentId')
  @ApiOperation({ summary: 'Get replies to a comment' })
  async findByParent(@Param('parentId') parentId: string) {
    return this.commentService.findByParent(parentId);
  }

  @Get('count/:targetType/:targetId')
  @ApiOperation({ summary: 'Count comments for a target' })
  async countByTarget(@Param('targetType') targetType: string, @Param('targetId') targetId: string) {
    const count = await this.commentService.countByTarget(targetType, targetId);
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  async findOne(@Param('id') id: string) {
    return this.commentService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a generic comment' })
  async update(@Param('id') id: string, @Body() dto: UpdateCommentDto, @Request() req: any) {
    return this.commentService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a generic comment' })
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.commentService.delete(id, req.user.userId);
    return { message: 'Comment deleted successfully' };
  }
}
