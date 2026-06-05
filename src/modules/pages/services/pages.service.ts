import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Page, PageDocument } from '../schemas/page.schema';
import { CreatePageDto } from '../dtos/create-page.dto';
import { UpdatePageDto } from '../dtos/update-page.dto';
import { FilterPageDto } from '../dtos/filter-page.dto';
import {
  Workspace,
  WorkspaceDocument,
} from '@/modules/workspaces/schemas/workspace.schema';

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim();
}

const MAX_DEPTH = 5;

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @InjectModel(Page.name) private readonly pageModel: Model<PageDocument>,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  async create(dto: CreatePageDto, userId: string): Promise<PageDocument> {
    this.logger.debug(`Creating page "${dto.title}" by user ${userId}`);

    // ── Depth check: new page will be at parentDepth + 1 ───────
    if (dto.parentId) {
      const parentDepth = await this.getAncestorDepth(dto.parentId);
      if (parentDepth + 1 >= MAX_DEPTH) {
        throw new BadRequestException(
          `Cannot create page: maximum nesting depth of ${MAX_DEPTH} levels exceeded`,
        );
      }
    }

    const slug = dto.slug || (await this.generateUniqueSlug(dto.title));

    const page = new this.pageModel({
      title: dto.title,
      content: dto.content || '',
      workspaceId: dto.workspaceId
        ? new Types.ObjectId(dto.workspaceId)
        : undefined,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      slug,
      authorId: new Types.ObjectId(userId),
      status: dto.status || 'draft',
      labels: dto.labels || [],
      version: 1,
      viewCount: 0,
      versionHistory: [],
    });

    const savedPage = await page.save();
    this.logger.debug(`Page created with id: ${savedPage._id}`);
    return savedPage;
  }

  async findById(id: string): Promise<PageDocument> {
    this.logger.debug(`Finding page by id: ${id}`);

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Page with id ${id} not found`);
    }

    const page = await this.pageModel
      .findById(id)
      .populate('lastEditedBy', 'fullName')
      .exec();
    if (!page) {
      throw new NotFoundException(`Page with id ${id} not found`);
    }
    return page;
  }

  async findBySlug(slug: string): Promise<PageDocument> {
    this.logger.debug(`Finding page by slug: ${slug}`);

    const page = await this.pageModel
      .findOne({ slug })
      .populate('lastEditedBy', 'fullName')
      .exec();
    if (!page) {
      throw new NotFoundException(`Page with slug "${slug}" not found`);
    }
    return page;
  }

  async findAll(filter: FilterPageDto): Promise<{
    data: PageDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.logger.debug('Finding pages with filters');

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};

    if (filter.workspaceId) {
      query.workspaceId = new Types.ObjectId(filter.workspaceId);
    }
    if (filter.parentId) {
      query.parentId = new Types.ObjectId(filter.parentId);
    } else if (filter.parentId === null) {
      query.parentId = { $exists: false };
    }
    if (filter.authorId) {
      query.authorId = new Types.ObjectId(filter.authorId);
    }
    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.search) {
      const searchNormalized = normalizeForSearch(filter.search);
      query.$or = [
        { title: { $regex: searchNormalized, $options: 'i' } },
        { content: { $regex: searchNormalized, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.pageModel
        .find(query)
        .populate('lastEditedBy', 'fullName')
        .skip(skip)
        .limit(limit)
        .sort({ updatedAt: -1 })
        .exec(),
      this.pageModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * @deprecated
   * use findByWorkspaceId instead
   */
  async findByWorkspaceKey(workspaceKey: string): Promise<PageDocument[]> {
    return this.findByWorkspaceId(workspaceKey);
  }

  async findByWorkspaceId(workspaceId: string): Promise<PageDocument[]> {
    this.logger.debug(`Finding pages for workspace: ${workspaceId}`);

    return this.pageModel
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .populate('lastEditedBy', 'fullName')
      .sort({ title: 1 })
      .exec();
  }

  async findRootPages(workspaceId: string): Promise<PageDocument[]> {
    this.logger.debug(`Finding root pages for workspace: ${workspaceId}`);

    return this.pageModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        parentId: { $exists: false },
      })
      .populate('lastEditedBy', 'fullName')
      .sort({ title: 1 })
      .exec();
  }

  async findChildren(parentId: string): Promise<PageDocument[]> {
    this.logger.debug(`Finding children for page: ${parentId}`);

    if (!Types.ObjectId.isValid(parentId)) {
      throw new NotFoundException(`Page with id ${parentId} not found`);
    }

    return this.pageModel
      .find({ parentId: new Types.ObjectId(parentId) })
      .populate('lastEditedBy', 'fullName')
      .sort({ title: 1 })
      .exec();
  }

  async findByAuthor(authorId: string): Promise<PageDocument[]> {
    this.logger.debug(`Finding pages by author: ${authorId}`);

    if (!Types.ObjectId.isValid(authorId)) {
      throw new NotFoundException(`User with id ${authorId} not found`);
    }

    return this.pageModel
      .find({ authorId: new Types.ObjectId(authorId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async update(
    id: string,
    dto: UpdatePageDto,
    userId: string,
  ): Promise<PageDocument> {
    this.logger.debug(`Updating page ${id} by user ${userId}`);

    const page = await this.findById(id);

    if (dto.title !== undefined) page.title = dto.title;
    if (dto.content !== undefined) page.content = dto.content;
    if (dto.status) page.status = dto.status;
    if (dto.labels) page.labels = dto.labels;

    page.lastEditedBy = new Types.ObjectId(userId);
    page.version += 1;

    page.versionHistory.push({
      editedBy: new Types.ObjectId(userId),
      editedAt: new Date(),
      changes: this.getChangesSummary(dto),
    });

    return page.save();
  }

  async delete(id: string): Promise<void> {
    const page = await this.findById(id);

    await this.deleteChildrenRecursively(id);

    await this.pageModel.deleteOne({ _id: id }).exec();
    this.logger.debug(`Page ${id} deleted`);
  }

  private async deleteChildrenRecursively(parentId: string): Promise<void> {
    // pipeline: find parent node => get all children
    const result = await this.pageModel.aggregate([
      {
        $match: {
          _id: new Types.ObjectId(parentId),
        },
      },
      {
        $graphLookup: {
          from: 'pages',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentId',
          as: 'descendants',
        },
      },
    ]);

    const descendants = result[0]?.descendants ?? [];

    const idsToDelete = descendants.map((x) => x._id);

    if (idsToDelete.length > 0) {
      await this.pageModel.deleteMany({
        _id: { $in: idsToDelete },
      });
    }
  }

  async moveToParent(
    pageId: string,
    newParentId: string | null,
  ): Promise<PageDocument> {
    this.logger.debug(`Moving page ${pageId} to parent ${newParentId}`);

    const page = await this.findById(pageId);

    if (newParentId) {
      if (!Types.ObjectId.isValid(newParentId)) {
        throw new NotFoundException(
          `Parent page with id ${newParentId} not found`,
        );
      }

      if (newParentId === pageId) {
        throw new BadRequestException('A page cannot be its own parent');
      }

      // ── Circular-reference check: newParent must NOT be a descendant of page ──
      const descendants = await this.getAllDescendantIds(pageId);
      if (descendants.includes(newParentId)) {
        throw new BadRequestException(
          'Cannot move a page into its own descendant (circular reference)',
        );
      }

      // ── Depth check: parentDepth + 1 (this page) + subtreeDepth ≤ MAX_DEPTH ──
      const newParentDepth = await this.getAncestorDepth(newParentId);
      const subtreeDepth = await this.getMaxDescendantDepth(pageId);
      const totalDepth = newParentDepth + 1 + subtreeDepth;

      if (totalDepth >= MAX_DEPTH) {
        throw new BadRequestException(
          `Cannot move page: maximum nesting depth of ${MAX_DEPTH} levels would be exceeded`,
        );
      }

      const newParent = await this.findById(newParentId);
      page.parentId = newParent._id;
    } else {
      page.parentId = undefined as any;
    }

    return page.save();
  }

  async publish(pageId: string): Promise<PageDocument> {
    this.logger.debug(`Publishing page ${pageId}`);

    const page = await this.findById(pageId);
    page.status = 'published';
    return page.save();
  }

  async unpublish(pageId: string): Promise<PageDocument> {
    this.logger.debug(`Unpublishing page ${pageId}`);

    const page = await this.findById(pageId);
    page.status = 'draft';
    return page.save();
  }

  async incrementViewCount(id: string): Promise<PageDocument> {
    this.logger.debug(`Incrementing view count for page ${id}`);

    const page = await this.pageModel
      .findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true })
      .exec();

    if (!page) {
      throw new NotFoundException(`Page with id ${id} not found`);
    }

    return page;
  }

  async addLabel(pageId: string, label: string): Promise<PageDocument> {
    this.logger.debug(`Adding label "${label}" to page ${pageId}`);

    const page = await this.findById(pageId);

    if (!page.labels.includes(label)) {
      page.labels.push(label);
    }

    return page.save();
  }

  async removeLabel(pageId: string, label: string): Promise<PageDocument> {
    this.logger.debug(`Removing label "${label}" from page ${pageId}`);

    const page = await this.findById(pageId);
    page.labels = page.labels.filter((l) => l !== label);

    return page.save();
  }

  async generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = this.slugify(title);
    let slug = baseSlug;
    let counter = 1;

    while (await this.pageModel.findOne({ slug }).exec()) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  private getChangesSummary(dto: UpdatePageDto): string {
    const changes: string[] = [];
    if (dto.title) changes.push('title');
    if (dto.content !== undefined) changes.push('content');
    if (dto.status) changes.push('status');
    if (dto.labels) changes.push('labels');
    return changes.join(', ');
  }

  // ── Depth helpers ──────────────────────────────────────────

  /**
   * Walk up the parent chain to compute how deep this page is.
   * Root pages have depth 0.
   */
  private async getAncestorDepth(pageId: string): Promise<number> {
    let depth = 0;
    let currentId = pageId;

    while (true) {
      const page = await this.pageModel
        .findById(currentId)
        .select('parentId')
        .lean()
        .exec();

      if (!page || !page.parentId) break;
      depth++;
      currentId = page.parentId.toString();

      // Safety guard against corrupted data
      if (depth > MAX_DEPTH + 10) break;
    }

    return depth;
  }

  /**
   * Find the maximum depth among all descendants of a page.
   * A leaf node returns 0.  A node with one direct child returns 1, etc.
   */
  private async getMaxDescendantDepth(pageId: string): Promise<number> {
    const result = await this.pageModel.aggregate([
      { $match: { _id: new Types.ObjectId(pageId) } },
      {
        $graphLookup: {
          from: 'pages',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentId',
          as: 'descendants',
          depthField: 'depth',
        },
      },
      { $project: { maxDepth: { $max: '$descendants.depth' } } },
    ]);

    // maxDepth is 0-indexed from $graphLookup, so add 1 to get level count
    const maxDepth = result[0]?.maxDepth;
    return maxDepth != null ? maxDepth + 1 : 0;
  }

  /**
   * Return all descendant IDs of a given page (for circular-reference checks).
   */
  private async getAllDescendantIds(pageId: string): Promise<string[]> {
    const result = await this.pageModel.aggregate([
      { $match: { _id: new Types.ObjectId(pageId) } },
      {
        $graphLookup: {
          from: 'pages',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentId',
          as: 'descendants',
        },
      },
      { $project: { ids: '$descendants._id' } },
    ]);

    return (result[0]?.ids ?? []).map((id: Types.ObjectId) => id.toString());
  }
}
