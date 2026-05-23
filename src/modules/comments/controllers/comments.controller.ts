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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommentsService } from '../services/comments.service';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new comment' })
  async create(@Body() dto: CreateCommentDto, @Request() req: any) {
    return this.commentsService.create(dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List comments' })
  @ApiQuery({ name: 'targetType', required: true, enum: ['task', 'page'] })
  @ApiQuery({ name: 'targetId', required: true })
  async findAll(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ) {
    return this.commentsService.findByTarget(targetType, targetId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  async findOne(@Param('id') id: string) {
    return this.commentsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a comment' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a comment' })
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.commentsService.delete(id, req.user.userId);
    return { message: 'Comment deleted successfully' };
  }

  @Get('target/:targetType/:targetId')
  @ApiOperation({ summary: 'Get all comments for a target (task or page)' })
  async findByTarget(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.commentsService.findByTarget(targetType, targetId);
  }

  @Get('target/:targetType/:targetId/threaded')
  @ApiOperation({ summary: 'Get all comments for a target as threads' })
  async findByTargetThreaded(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.commentsService.findByTargetThreaded(targetType, targetId);
  }

  @Get('parent/:parentId')
  @ApiOperation({ summary: 'Get replies to a comment' })
  async findByParent(@Param('parentId') parentId: string) {
    return this.commentsService.findByParent(parentId);
  }

  @Get('count/:targetType/:targetId')
  @ApiOperation({ summary: 'Count comments for a target' })
  async countByTarget(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    const count = await this.commentsService.countByTarget(targetType, targetId);
    return { count };
  }
}
