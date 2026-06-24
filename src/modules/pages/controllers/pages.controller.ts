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
  HttpCode,
  HttpStatus,
  Patch,
  Inject,
  forwardRef,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiNoContentResponse,
  ApiExtraModels,
} from '@nestjs/swagger';
import { PagesService } from '../services/pages.service';
import { CreatePageDto } from '../dtos/create-page.dto';
import { UpdatePageDto } from '../dtos/update-page.dto';
import { FilterPageDto } from '../dtos/filter-page.dto';
import { SyncPageDto } from '../dtos/sync-page.dto';
import { CreateVersionDto } from '../dtos/create-version.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { RealtimeService } from '../../realtime/realtime.service';
import { FileInterceptor } from '@nestjs/platform-express';

// ---------------------------------------------------------------------------
// Response shape DTOs (inline, for Swagger schema only — no runtime overhead)
// ---------------------------------------------------------------------------

class VersionHistoryEntryDto {
  /** ObjectId of the user who made the edit */
  editedBy!: string;
  editedAt!: Date;
  /** Comma-separated list of changed fields, e.g. "title, content" */
  changes!: string;
}

class PageResponseDto {
  _id!: string;
  workspaceId!: string;
  title!: string;
  /** Raw HTML produced by TipTap's getHTML() */
  content!: string;
  parentId?: string;
  slug!: string;
  authorId!: string;
  lastEditedBy?: string;
  version!: number;
  /** @enum {string} */
  labels!: string[];
  versionHistory!: VersionHistoryEntryDto[];
  createdAt!: Date;
  updatedAt!: Date;
}

class PaginatedPagesResponseDto {
  data!: PageResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
}

class MovePageBodyDto {
  /** Set to null to move page to root level */
  parentId?: string | null;
}

class UpdateLabelsBodyDto {
  labels!: string[];
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('Pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pages') // independent endpoint
@ApiExtraModels(PageResponseDto, PaginatedPagesResponseDto)
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@ApiForbiddenResponse({ description: 'Insufficient role for this resource' })
export class PagesController {
  constructor(
    private readonly pagesService: PagesService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
  ) {}

  // -------------------------------------------------------------------------
  // POST /pages
  // -------------------------------------------------------------------------
  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_CREATE)
  @ApiOperation({
    summary: 'Create a new page',
    description:
      'Creates a page inside a workspace. `content` should be the raw HTML string ' +
      "returned by TipTap's `editor.getHTML()`. If `slug` is omitted, a unique slug " +
      'is auto-generated from the title.',
  })
  @ApiCreatedResponse({
    description: 'Page created successfully',
    type: PageResponseDto,
  })
  async create(@Body() createPageDto: CreatePageDto, @Request() req: any) {
    return this.pagesService.create(createPageDto, req.user.userId);
  }

  // -------------------------------------------------------------------------
  // GET /pages
  // -------------------------------------------------------------------------
  @Get()
  @ApiOperation({
    summary: 'List pages with filters & pagination',
    description:
      'Returns a paginated list of pages. All filter params are optional. ' +
      '`search` performs a case-insensitive regex match on title and content ' +
      '(note: content is stored as raw HTML, so the match runs on HTML source).',
  })
  @ApiOkResponse({
    description: 'Paginated list of pages',
    type: PaginatedPagesResponseDto,
  })
  async findAll(@Query() filterDto: FilterPageDto) {
    return this.pagesService.findAll(filterDto);
  }

  // -------------------------------------------------------------------------
  // GET /pages/link-preview
  // -------------------------------------------------------------------------
  @Get('link-preview')
  @ApiOperation({
    summary: 'Get link preview metadata',
    description: 'Fetch OpenGraph metadata securely via backend proxy',
  })
  @ApiQuery({ name: 'url', description: 'URL to preview' })
  async getLinkPreview(@Query('url') url: string) {
    return this.pagesService.getLinkPreview(url);
  }

  // -------------------------------------------------------------------------
  // GET /pages/:id
  // -------------------------------------------------------------------------
  @Get(':id')
  // @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'Get page by ID',
    description:
      'Fetches a single page and increments its view counter atomically.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page' })
  @ApiOkResponse({ description: 'Page found', type: PageResponseDto })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async findById(@Param('id') id: string) {
    await this.pagesService.incrementViewCount(id);
    return this.pagesService.findById(id);
  }

  // -------------------------------------------------------------------------
  // GET /pages/slug/:slug
  // -------------------------------------------------------------------------
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get page by slug',
    description:
      'Fetches a single page by its URL-friendly slug and increments the view counter.',
  })
  @ApiParam({
    name: 'slug',
    description: 'URL-friendly slug, e.g. "getting-started-guide"',
  })
  @ApiOkResponse({ description: 'Page found', type: PageResponseDto })
  @ApiNotFoundResponse({ description: 'No page with the given slug exists' })
  async findBySlug(@Param('slug') slug: string) {
    const page = await this.pagesService.findBySlug(slug);
    await this.pagesService.incrementViewCount(page._id.toString());
    return page;
  }

  // -------------------------------------------------------------------------
  // PATCH /pages/:id
  // -------------------------------------------------------------------------
  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Update a page',
    description:
      'Partially updates a page. Only the fields present in the request body are changed. ' +
      'Each successful update increments `version` by 1 and appends an entry to `versionHistory`. ' +
      '`content` accepts the raw HTML string from TipTap.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page' })
  @ApiOkResponse({
    description: 'Page updated successfully',
    type: PageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async update(
    @Param('id') id: string,
    @Body() updatePageDto: UpdatePageDto,
    @Request() req: any,
  ) {
    return this.pagesService.update(id, updatePageDto, req.user.userId);
  }

  // -------------------------------------------------------------------------
  // PATCH /pages/:id/sync
  // -------------------------------------------------------------------------
  @Patch(':id/sync')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Synchronize page Yjs state and document content snapshots',
    description:
      'Updates page yjsState, contentJson, content (HTML), and plainTextSnapshot.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page' })
  @ApiOkResponse({
    description: 'Page synchronized successfully',
    type: PageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async sync(
    @Param('id') id: string,
    @Body() syncPageDto: SyncPageDto,
    @Request() req: any,
  ) {
    return this.pagesService.sync(id, syncPageDto, req.user.userId);
  }

  // -------------------------------------------------------------------------
  // DELETE /pages/:id
  // -------------------------------------------------------------------------
  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a page',
    description:
      'Deletes a page **and all its descendants** recursively (via `$graphLookup`). ' +
      'This operation is irreversible. Requires WORKSPACE_ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the page to delete',
  })
  @ApiNoContentResponse({ description: 'Page and all descendants deleted' })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async delete(@Param('id') id: string) {
    return this.pagesService.delete(id);
  }

  // -------------------------------------------------------------------------
  // PUT /pages/:id/move
  // -------------------------------------------------------------------------
  @Put(':id/move')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Move page to a different parent',
    description:
      'Re-parents a page. Pass `parentId: null` (or omit the field) to move the page ' +
      'to root level. Cannot set a page as its own parent.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page to move' })
  @ApiBody({
    type: MovePageBodyDto,
    examples: {
      moveToParent: {
        summary: 'Move under a parent page',
        value: { parentId: '665f1a2b3c4d5e6f7a8b9c0d' },
      },
      moveToRoot: {
        summary: 'Move to root (top level)',
        value: { parentId: null },
      },
    },
  })
  @ApiOkResponse({
    description: 'Page moved successfully',
    type: PageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Page or new parent not found' })
  async moveToParent(
    @Param('id') id: string,
    @Body('parentId') parentId: string | null,
  ) {
    return this.pagesService.moveToParent(id, parentId);
  }

  // -------------------------------------------------------------------------
  // POST /pages/:id/publish
  // -------------------------------------------------------------------------
  // Publication state is no longer part of workspace documents.
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Legacy page endpoint',
    description:
      'Sets the page status to `published`. Idempotent — safe to call on already-published pages.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page' })
  @ApiOkResponse({ description: 'Page published', type: PageResponseDto })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async publish(@Param('id') id: string) {
    return this.pagesService.findById(id);
  }

  // -------------------------------------------------------------------------
  // POST /pages/:id/unpublish
  // -------------------------------------------------------------------------
  // Publication state is no longer part of workspace documents.
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Legacy page endpoint',
    description: 'Reverts the page status back to `draft`.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page' })
  @ApiOkResponse({
    description: 'Page reverted to draft',
    type: PageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async unpublish(@Param('id') id: string) {
    return this.pagesService.findById(id);
  }

  // -------------------------------------------------------------------------
  // GET /pages/workspace/:workspaceId
  // -------------------------------------------------------------------------
  @Get('workspace/:workspaceId')
  // @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'Get all pages in a workspace',
    description:
      'Returns **all** pages (all levels) for the workspace, sorted by title.',
  })
  @ApiParam({ name: 'workspaceId', description: 'The ID of the workspace' })
  @ApiOkResponse({ description: 'List of pages', type: [PageResponseDto] })
  @ApiNotFoundResponse({ description: 'Invalid workspace ID' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.pagesService.findByWorkspaceId(workspaceId);
  }

  // -------------------------------------------------------------------------
  // GET /pages/workspace/:workspaceId/root
  // -------------------------------------------------------------------------
  @Get('workspace/:workspaceId/root')
  // @UseGuards(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'Get root-level pages for a workspace',
    description:
      'Returns only pages that have no parent (`parentId` is unset). ' +
      'Use this as the entry point for building the page tree in the sidebar.',
  })
  @ApiParam({ name: 'workspaceId', description: 'ID of the workspace' })
  @ApiOkResponse({ description: 'Root pages', type: [PageResponseDto] })
  @ApiNotFoundResponse({ description: 'Invalid workspace ID' })
  async findRootPages(@Param('workspaceId') workspaceId: string) {
    return this.pagesService.findRootPages(workspaceId);
  }

  // -------------------------------------------------------------------------
  // GET /pages/:id/children
  // -------------------------------------------------------------------------
  @Get(':id/children')
  // @UseGuards(ScopedRoleGuard('page', SPACE_ROLES.VIEWER))
  @ApiOperation({
    summary: 'Get direct children of a page',
    description:
      'Returns the immediate child pages sorted by title. Not recursive — call repeatedly to walk the tree lazily.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the parent page' })
  @ApiOkResponse({ description: 'Child pages', type: [PageResponseDto] })
  @ApiNotFoundResponse({ description: 'Parent page not found' })
  async findChildren(@Param('id') id: string) {
    return this.pagesService.findChildren(id);
  }

  // -------------------------------------------------------------------------
  // PUT /pages/:id/labels
  // -------------------------------------------------------------------------
  @Put(':id/labels')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Replace all labels on a page',
    description:
      'Performs a full **replace** of the label set: labels in the request that are ' +
      'not currently on the page are added; labels currently on the page that are ' +
      'absent from the request are removed. Pass an empty array to clear all labels.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the page' })
  @ApiBody({
    type: UpdateLabelsBodyDto,
    examples: {
      setLabels: {
        summary: 'Set two labels',
        value: { labels: ['frontend', 'onboarding'] },
      },
      clearLabels: {
        summary: 'Remove all labels',
        value: { labels: [] },
      },
    },
  })
  @ApiOkResponse({
    description: 'Updated page with new label set',
    type: PageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Page not found' })
  async updateLabels(
    @Param('id') id: string,
    @Body('labels') labels: string[],
  ) {
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

  // -------------------------------------------------------------------------
  // POST /pages/:id/versions
  // -------------------------------------------------------------------------
  @Post(':id/versions')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Create a new named version',
    description:
      'Saves current document state (yjsState, content, contentJson) as a named version.',
  })
  @ApiParam({ name: 'id', description: 'Document page ID' })
  @ApiBody({ type: CreateVersionDto })
  @ApiCreatedResponse({ description: 'New version successfully created' })
  async createVersion(
    @Param('id') id: string,
    @Body() dto: CreateVersionDto,
    @Request() req: any,
  ) {
    return this.pagesService.createVersion(id, dto.label, req.user.userId);
  }

  // -------------------------------------------------------------------------
  // GET /pages/:id/versions
  // -------------------------------------------------------------------------
  @Get(':id/versions')
  @ApiOperation({
    summary: 'Get document version list',
    description:
      'Returns a list of saved versions of the document, sorted by newest creation time.',
  })
  @ApiParam({ name: 'id', description: 'Document page ID' })
  @ApiOkResponse({ description: 'List of versions' })
  async getVersions(@Param('id') id: string) {
    return this.pagesService.getVersions(id);
  }

  // -------------------------------------------------------------------------
  // GET /pages/:id/versions/:versionId
  // -------------------------------------------------------------------------
  @Get(':id/versions/:versionId')
  @ApiOperation({
    summary: 'Get details of a document version',
    description: 'Returns details and snapshot content of the version.',
  })
  @ApiParam({ name: 'id', description: 'Document page ID' })
  @ApiParam({ name: 'versionId', description: 'Version ID' })
  @ApiOkResponse({ description: 'Version details' })
  async getVersionById(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.pagesService.getVersionById(id, versionId);
  }

  // -------------------------------------------------------------------------
  // POST /pages/:id/versions/:versionId/restore
  // -------------------------------------------------------------------------
  @Post(':id/versions/:versionId/restore')
  @UseGuards(WorkspaceRoleGuard)
  @RequirePermissions(WORKSPACE_PERMISSIONS.PAGE_EDIT)
  @ApiOperation({
    summary: 'Restore document to specified version',
    description: 'Restores document content and Yjs state to saved version.',
  })
  @ApiParam({ name: 'id', description: 'Document page ID' })
  @ApiParam({ name: 'versionId', description: 'Version ID' })
  @ApiOkResponse({ description: 'Document successfully restored' })
  async restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Request() req: any,
  ) {
    const page = await this.pagesService.restoreVersion(
      id,
      versionId,
      req.user.userId,
    );

    // Broadcast real-time notification to all connected clients in the page room
    this.realtimeService.emitPageVersionRestored(
      page._id.toString(),
      page.yjsState,
      page.content,
      page.contentJson,
    );

    return page;
  }

  // -------------------------------------------------------------------------
  // GET /pages/:id/export/docx
  // -------------------------------------------------------------------------
  @Get(':id/export/docx')
  @UseGuards(WorkspaceRoleGuard)
  @ApiOperation({
    summary: 'Export document as Word file (.docx)',
    description:
      'Converts HTML of the current document to Word file (.docx) for download.',
  })
  @ApiParam({ name: 'id', description: 'Document page ID' })
  async exportDocx(@Param('id') id: string, @Res() res: any) {
    const { buffer, filename } = await this.pagesService.exportToDocx(id);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  // -------------------------------------------------------------------------
  // POST /pages/import/docx
  // -------------------------------------------------------------------------
  @Post('import/docx')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (req: any, file: any, cb: any) => {
        if (!file.originalname.match(/\.(docx)$/)) {
          return cb(
            new BadRequestException('Only .docx files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: 'Import content from Word file (.docx)',
    description:
      'Converts uploaded Word file (.docx) to clean HTML to insert into editor.',
  })
  async importDocx(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please upload a Word (.docx) file');
    }
    const html = await this.pagesService.importFromDocx(file.buffer);
    return { html };
  }
}
