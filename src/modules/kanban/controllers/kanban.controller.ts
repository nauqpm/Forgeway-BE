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
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Workspaces - Kanban')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:key/board')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get()
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get board configuration for the workspace' })
  async getBoard(@Param('key') key: string) {
    return this.kanbanService.findOrCreateByWorkspaceKey(key);
  }

  @Put('columns')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Replace all board columns' })
  @ApiBody({ type: [KanbanBoardColumnDto] })
  @ApiResponse({ status: 200, description: 'Board after column replacement' })
  async updateColumns(
    @Param('key') key: string,
    @Body() columns: KanbanBoardColumnDto[],
  ) {
    const board = await this.kanbanService.findOrCreateByWorkspaceKey(key);
    return this.kanbanService.replaceColumns(board._id.toString(), columns);
  }

  @Post('columns')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Add a new column to the board' })
  @ApiBody({ type: CreateColumnDto })
  @ApiResponse({ status: 201, description: 'Board with the new column' })
  async addColumn(
    @Param('key') key: string,
    @Body() dto: CreateColumnDto,
  ) {
    const board = await this.kanbanService.findOrCreateByWorkspaceKey(key);
    return this.kanbanService.addColumn(board._id.toString(), dto);
  }

  @Patch('columns/:columnId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update column name or mapped statuses' })
  @ApiParam({ name: 'columnId', description: 'Column ID' })
  @ApiBody({ type: UpdateColumnDto })
  @ApiResponse({ status: 200, description: 'Updated board' })
  async updateColumn(
    @Param('key') key: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    const board = await this.kanbanService.findOrCreateByWorkspaceKey(key);
    return this.kanbanService.updateColumn(board._id.toString(), columnId, dto);
  }

  @Patch('columns/:columnId/wip-limit')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update WIP limit for a column' })
  @ApiParam({ name: 'columnId', description: 'Column ID' })
  @ApiBody({ type: UpdateWipLimitDto })
  @ApiResponse({ status: 200, description: 'Updated board' })
  async updateWipLimit(
    @Param('key') key: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateWipLimitDto,
  ) {
    const board = await this.kanbanService.findOrCreateByWorkspaceKey(key);
    return this.kanbanService.updateWipLimit(board._id.toString(), columnId, dto.wipLimit);
  }

  @Patch('columns/:columnId/move')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Move column to new position (drag-and-drop)' })
  @ApiParam({ name: 'columnId', description: 'Column ID to move' })
  @ApiBody({ type: MoveColumnDto })
  @ApiResponse({ status: 200, description: 'Board with updated column order' })
  async moveColumn(
    @Param('key') key: string,
    @Param('columnId') columnId: string,
    @Body() dto: MoveColumnDto,
  ) {
    const board = await this.kanbanService.findOrCreateByWorkspaceKey(key);
    return this.kanbanService.moveColumn(board._id.toString(), columnId, dto);
  }

  @Delete('columns/:columnId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Delete column from board (migrate tasks if needed)' })
  @ApiParam({ name: 'columnId', description: 'Column ID to delete' })
  @ApiBody({ type: DeleteColumnDto, required: false })
  @ApiResponse({ status: 200, description: 'Board after column deletion' })
  async deleteColumn(
    @Param('key') key: string,
    @Param('columnId') columnId: string,
    @Body() dto: DeleteColumnDto,
  ) {
    const board = await this.kanbanService.findOrCreateByWorkspaceKey(key);
    return this.kanbanService.deleteColumn(board._id.toString(), columnId, dto.targetColumnId);
  }
}
