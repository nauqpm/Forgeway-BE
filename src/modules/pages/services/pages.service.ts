import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Page, PageDocument } from '../schemas/page.schema';
import { CreatePageDto } from '../dtos/create-page.dto';
import { UpdatePageDto } from '../dtos/update-page.dto';
import { FilterPageDto } from '../dtos/filter-page.dto';
import { Workspace, WorkspaceDocument } from '@/modules/workspaces/schemas/workspace.schema';

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim();
}

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @InjectModel(Page.name) private readonly pageModel: Model<PageDocument>,
    @InjectModel(Workspace.name) private readonly workspaceModel: Model<WorkspaceDocument>,
  ) { }

  async create(dto: CreatePageDto, userId: string): Promise<PageDocument> {
    this.logger.debug(`Creating page "${dto.title}" by user ${userId}`);

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

    const page = await this.pageModel.findById(id).exec();
    if (!page) {
      throw new NotFoundException(`Page with id ${id} not found`);
    }
    return page;
  }

  async findBySlug(slug: string): Promise<PageDocument> {
    this.logger.debug(`Finding page by slug: ${slug}`);

    const page = await this.pageModel.findOne({ slug }).exec();
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

    if (dto.title) page.title = dto.title;
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
        throw new NotFoundException('A page cannot be its own parent');
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
}
