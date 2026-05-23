import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { KanbanService } from '../services/kanban.service';
import {
  KanbanBoardColumnDto,
  CreateColumnDto,
  UpdateColumnDto,
  UpdateWipLimitDto,
  MoveColumnDto,
  DeleteColumnDto,
} from '../dtos/kanban.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Kanban')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard)
@Controller('kanban')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) { }

  // ─── Board-level endpoints (existing) ──────────────────────

  @Get('workspace/:workspaceKey')
  @ApiOperation({ summary: 'Get boards for workspace' })
  @ApiResponse({ status: 200, description: 'Danh sách board của workspace', schema: { example: [{ _id: '...', workspaceId: '...', columns: [] }] } })
  async findByWorkspaceKey(@Param('workspaceKey') workspaceKey: string) {
    return this.kanbanService.findByWorkspaceKey(workspaceKey);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get board by ID' })
  @ApiResponse({ status: 200, description: 'Thông tin board', schema: { example: { _id: '...', workspaceId: '...', columns: [{ id: 'todo', name: 'To Do', order: 0 }] } } })
  async findOne(@Param('id') id: string) {
    return this.kanbanService.findById(id);
  }

  @Put(':id/columns')
  @ApiOperation({ summary: 'Replace board columns' })
  @ApiBody({ type: [KanbanBoardColumnDto] })
  @ApiResponse({ status: 200, description: 'Board sau khi replace columns' })
  async replaceColumns(
    @Param('id') id: string,
    @Body() columns: KanbanBoardColumnDto[],
  ) {
    return this.kanbanService.replaceColumns(id, columns);
  }

  // ─── Column CRUD endpoints (new) ───────────────────────────

  @Post(':boardId/columns')
  @ApiOperation({ summary: 'Tạo column mới cho board' })
  @ApiParam({ name: 'boardId', description: 'ID của board' })
  @ApiBody({ type: CreateColumnDto })
  @ApiResponse({
    status: 201,
    description: 'Tạo column thành công, trả về board với column mới',
    schema: {
      example: {
        _id: '...', workspaceId: '...',
        columns: [
          { id: 'todo', name: 'To Do', order: 0, mappedStatuses: ['todo'] },
          { id: 'uuid-generated', name: 'In Review', order: 3, mappedStatuses: [] },
        ],
      },
    },
  })
  async addColumn(
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.kanbanService.addColumn(boardId, dto);
  }

  @Patch(':boardId/columns/:columnId')
  @ApiOperation({ summary: 'Cập nhật column (name, mappedStatuses)' })
  @ApiParam({ name: 'boardId', description: 'ID của board' })
  @ApiParam({ name: 'columnId', description: 'ID của column' })
  @ApiBody({ type: UpdateColumnDto })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật thành công, trả về board',
    schema: {
      example: {
        _id: '...', workspaceId: '...',
        columns: [{ id: 'todo', name: 'Updated Name', order: 0, mappedStatuses: ['open'] }],
      },
    },
  })
  async updateColumn(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.kanbanService.updateColumn(boardId, columnId, dto);
  }

  @Patch(':boardId/columns/:columnId/wip-limit')
  @ApiOperation({ summary: 'Cập nhật WIP limit cho column' })
  @ApiParam({ name: 'boardId', description: 'ID của board' })
  @ApiParam({ name: 'columnId', description: 'ID của column' })
  @ApiBody({ type: UpdateWipLimitDto })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật WIP limit thành công',
    schema: {
      example: {
        _id: '...', workspaceId: '...',
        columns: [{ id: 'inprogress', name: 'In Progress', order: 1, wipLimit: 5, mappedStatuses: ['in-progress'] }],
      },
    },
  })
  async updateWipLimit(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateWipLimitDto,
  ) {
    return this.kanbanService.updateWipLimit(boardId, columnId, dto.wipLimit);
  }

  @Patch(':boardId/columns/:columnId/move')
  @ApiOperation({ summary: 'Di chuyển column đến vị trí mới (drag-and-drop)' })
  @ApiParam({ name: 'boardId', description: 'ID của board' })
  @ApiParam({ name: 'columnId', description: 'ID của column cần di chuyển' })
  @ApiBody({ type: MoveColumnDto })
  @ApiResponse({
    status: 200,
    description: 'Di chuyển thành công, trả về board với order cập nhật',
    schema: {
      example: {
        _id: '...', workspaceId: '...',
        columns: [
          { id: 'inprogress', name: 'In Progress', order: 0 },
          { id: 'todo', name: 'To Do', order: 1 },
          { id: 'done', name: 'Done', order: 2 },
        ],
      },
    },
  })
  async moveColumn(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: MoveColumnDto,
  ) {
    return this.kanbanService.moveColumn(boardId, columnId, dto);
  }

  @Delete(':boardId/columns/:columnId')
  @ApiOperation({ summary: 'Xóa column khỏi board (migrate task nếu cần)' })
  @ApiParam({ name: 'boardId', description: 'ID của board' })
  @ApiParam({ name: 'columnId', description: 'ID của column cần xóa' })
  @ApiBody({ type: DeleteColumnDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Xóa thành công, trả về board sau khi xóa column',
    schema: {
      example: {
        _id: '...', workspaceId: '...',
        columns: [
          { id: 'todo', name: 'To Do', order: 0 },
          { id: 'done', name: 'Done', order: 1 },
        ],
      },
    },
  })
  async deleteColumn(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: DeleteColumnDto,
  ) {
    return this.kanbanService.deleteColumn(boardId, columnId, dto.targetColumnId);
  }
}

