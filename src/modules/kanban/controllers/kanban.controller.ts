import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { KanbanService } from '../services/kanban.service';
import { KanbanBoardColumnDto } from '../dtos/kanban.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Kanban')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kanban')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'Get boards for workspace' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.kanbanService.findByWorkspace(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get board by ID' })
  async findOne(@Param('id') id: string) {
    return this.kanbanService.findById(id);
  }

  @Put(':id/columns')
  @ApiOperation({ summary: 'Update board columns' })
  async updateColumns(
    @Param('id') id: string,
    @Body() columns: KanbanBoardColumnDto[],
  ) {
    return this.kanbanService.updateColumns(id, columns);
  }
}
