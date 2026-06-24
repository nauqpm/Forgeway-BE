import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from '../services/search.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { GlobalSearchDto } from '../dtos/global-search.dto';

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  @ApiOperation({ summary: 'Permission-scoped global search' })
  async globalSearch(
    @Query() dto: GlobalSearchDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.searchService.globalSearch(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Global search across tasks, workspaces, and pages',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({
    name: 'types',
    required: false,
    description:
      'Comma-separated list of types to search (task,workspace,page)',
  })
  @ApiQuery({
    name: 'workspaceId',
    required: false,
    description: 'Filter by workspace ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum results per type',
  })
  async search(
    @Query('q') query: string,
    @Query('types') types?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return { tasks: [], workspaces: [], pages: [], total: 0 };
    }

    const options: any = {};

    if (types) {
      options.types = types.split(',').map(t => t.trim());
    }

    if (workspaceId) {
      options.workspaceId = workspaceId;
    }

    if (limit) {
      options.limit = parseInt(limit, 10);
    }

    return this.searchService.search(query, options.workspaceId || '', options);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Search tasks only' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({
    name: 'workspaceId',
    required: false,
    description: 'Filter by Workspace ID',
  })
  async searchTasks(
    @Query('q') query: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    if (!query) {
      return [];
    }
    return this.searchService.searchTasks(query, workspaceId || undefined);
  }

  @Get('workspaces')
  @ApiOperation({ summary: 'Search workspaces only' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({
    name: 'workspaceId',
    required: false,
    description: 'Filter by workspace ID',
  })
  async searchWorkspaces(
    @Query('q') query: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.searchService.searchWorkspaces(query, workspaceId);
  }

  @Get('pages')
  @ApiOperation({ summary: 'Search pages only' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({
    name: 'spaceId',
    required: false,
    description: 'Filter by space ID',
  })
  async searchPages(
    @Query('q') query: string,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.searchService.searchPages(query, spaceId);
  }
}
