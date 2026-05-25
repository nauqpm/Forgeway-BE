import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PagesService } from '../services/pages.service';
import { CreatePageDto } from '../dtos/create-page.dto';
import { UpdatePageDto } from '../dtos/update-page.dto';
import { FilterPageDto } from '../dtos/filter-page.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@ApiTags('Pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) { }

  @Post()
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Create a new page' })
  async create(@Body() createPageDto: CreatePageDto, @Request() req: any) {
    return this.pagesService.create(createPageDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all pages with filters' })
  async findAll(@Query() filterDto: FilterPageDto) {
    return this.pagesService.findAll(filterDto);
  }

  @Get(':id')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get page by ID' })
  async findById(@Param('id') id: string) {
    await this.pagesService.incrementViewCount(id);
    return this.pagesService.findById(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get page by slug' })
  async findBySlug(@Param('slug') slug: string) {
    const page = await this.pagesService.findBySlug(slug);
    await this.pagesService.incrementViewCount(page._id.toString());
    return page;
  }

  @Put(':id')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update a page' })
  async update(
    @Param('id') id: string,
    @Body() updatePageDto: UpdatePageDto,
    @Request() req: any,
  ) {
    return this.pagesService.update(id, updatePageDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.WORKSPACE_ADMIN))
  @ApiOperation({ summary: 'Delete a page' })
  async delete(@Param('id') id: string) {
    return this.pagesService.delete(id);
  }

  @Put(':id/move')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Move page to a different parent' })
  async moveToParent(
    @Param('id') id: string,
    @Body('parentId') parentId: string | null,
  ) {
    return this.pagesService.moveToParent(id, parentId);
  }

  @Post(':id/publish')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Publish a page' })
  async publish(@Param('id') id: string) {
    return this.pagesService.publish(id);
  }

  @Post(':id/unpublish')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Unpublish a page' })
  async unpublish(@Param('id') id: string) {
    return this.pagesService.unpublish(id);
  }

  @Get('workspace/:workspaceId')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get all pages for a workspace' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.pagesService.findByWorkspace(workspaceId);
  }

  @Get('workspace/:workspaceId/root')
  @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get root pages for a workspace' })
  async findRootPages(@Param('workspaceId') workspaceId: string) {
    return this.pagesService.findRootPages(workspaceId);
  }

  @Get(':id/children')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'Get child pages' })
  async findChildren(@Param('id') id: string) {
    return this.pagesService.findChildren(id);
  }

  @Put(':id/labels')
  @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update page labels' })
  async updateLabels(@Param('id') id: string, @Body('labels') labels: string[]) {
    const page = await this.pagesService.findById(id);

    for (const label of labels) {
      if (!page.labels.includes(label)) {
        await this.pagesService.addLabel(id, label);
      }
    }

    for (const existingLabel of page.labels) {
      if (!labels.includes(existingLabel)) {
        await this.pagesService.removeLabel(id, existingLabel);
      }
    }

    return this.pagesService.findById(id);
  }
}
