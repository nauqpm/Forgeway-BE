import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { KanbanService } from '../services/kanban.service';
import { KanbanBoardColumnDto } from '../dtos/kanban.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Workspaces - Kanban')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:key/kanban')
export class KanbanController {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Get('board')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get board configuration for the workspace' })
  async getBoard(@Param('key') key: string) {
    const workspace = await this.workspacesService.findByKey(key);
    const boards = await this.kanbanService.findByWorkspace(workspace._id.toString());
    return boards[0];
  }

  @Put('board/columns')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Update board columns' })
  async updateColumns(
    @Param('key') key: string,
    @Body() columns: KanbanBoardColumnDto[],
  ) {
    const workspace = await this.workspacesService.findByKey(key);
    const boards = await this.kanbanService.findByWorkspace(workspace._id.toString());
    const board = boards[0];
    return this.kanbanService.updateColumns(board._id.toString(), columns);
  }
}
