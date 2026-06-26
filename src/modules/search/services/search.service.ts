import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment } from '../../comments/schemas/comment.schema';
import { Page } from '../../pages/schemas/page.schema';
import { Task } from '../../tasks/schemas/task.schema';
import { Workspace } from '../../workspaces/schemas/workspace.schema';
import { normalizeForSearch } from '../../../common/utils/normalizeForSearch';
import {
  GlobalSearchDto,
  GlobalSearchItem,
  GlobalSearchType,
} from '../dtos/global-search.dto';
import { GlobalSearchAuxiliaryService } from './global-search-auxiliary.service';
import type { SearchCursor } from './global-search-auxiliary.service';

export interface SearchOptions {
  types?: ('task' | 'workspace' | 'page')[];
  workspaceId?: string;
  limit?: number;
}

export interface SearchResult {
  tasks: any[];
  workspaces: any[];
  pages: any[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(Workspace.name) private workspaceModel: Model<Workspace>,
    @InjectModel(Page.name) private pageModel: Model<Page>,
    @InjectModel(Comment.name) private commentModel: Model<Comment>,
    private readonly auxiliarySearch: GlobalSearchAuxiliaryService,
  ) {}

  async globalSearch(userId: string, dto: GlobalSearchDto) {
    if (dto.q.length < 2) {
      throw new BadRequestException('q must be at least 2 characters');
    }

    const accessibleWorkspaces = await this.workspaceModel
      .find({
        deletedAt: null,
        $or: [
          { ownerId: new Types.ObjectId(userId) },
          { 'members.userId': new Types.ObjectId(userId) },
        ],
      })
      .select(
        '_id name description key searchText ownerId members createdAt updatedAt',
      )
      .lean()
      .exec();

    const requestedIds = (dto.workspaceIds ?? []).filter(
      Types.ObjectId.isValid,
    );
    const workspaces = requestedIds.length
      ? accessibleWorkspaces.filter(workspace =>
          requestedIds.includes(String(workspace._id)),
        )
      : accessibleWorkspaces;
    const workspaceIds = workspaces.map(workspace => workspace._id);
    if (!workspaceIds.length) {
      return { items: [], total: 0, hasMore: false };
    }

    const workspaceById = new Map(
      workspaces.map(workspace => [String(workspace._id), workspace]),
    );
    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const types: GlobalSearchType[] = dto.types?.length
      ? dto.types
      : ['task', 'page', 'comment', 'workspace', 'board', 'sprint', 'user'];
    const pageLimit = Math.min(dto.limit ?? 20, 50);
    const perTypeLimit = pageLimit + 1;
    const normalizedQuery = normalizeForSearch(dto.q);
    if (!normalizedQuery) {
      throw new BadRequestException('q must contain searchable characters');
    }
    const normalizedRegex = new RegExp(this.escapeRegex(normalizedQuery), 'i');
    const rawRegex = new RegExp(this.escapeRegex(dto.q), 'i');
    const items: GlobalSearchItem[] = [];

    const taskFilters = {
      ...(dto.assigneeIds?.length
        ? {
            assigneeId: {
              $in: dto.assigneeIds.map(id => new Types.ObjectId(id)),
            },
          }
        : {}),
      ...(dto.reporterId
        ? { reporterId: new Types.ObjectId(dto.reporterId) }
        : {}),
      ...(dto.status?.length ? { status: { $in: dto.status } } : {}),
      ...(dto.taskType?.length ? { type: { $in: dto.taskType } } : {}),
      ...(dto.priority?.length ? { priority: { $in: dto.priority } } : {}),
      ...(dto.updatedAfter || dto.updatedBefore
        ? {
            updatedAt: {
              ...(dto.updatedAfter ? { $gte: new Date(dto.updatedAfter) } : {}),
              ...(dto.updatedBefore
                ? { $lt: new Date(dto.updatedBefore) }
                : {}),
            },
          }
        : {}),
    };
    const updatedAtFilter =
      dto.updatedAfter || dto.updatedBefore
        ? {
            updatedAt: {
              ...(dto.updatedAfter ? { $gte: new Date(dto.updatedAfter) } : {}),
              ...(dto.updatedBefore
                ? { $lt: new Date(dto.updatedBefore) }
                : {}),
            },
          }
        : {};
    const documentAuthorFilter = dto.authorIds?.length
      ? { authorId: { $in: dto.authorIds.map(id => new Types.ObjectId(id)) } }
      : {};

    if (types.includes('task')) {
      const tasks = await this.taskModel
        .find({
          workspaceId: { $in: workspaceIds },
          isDeleted: { $ne: true },
          $or: [
            { searchText: normalizedRegex },
            { title: rawRegex },
            { description: rawRegex },
            { key: rawRegex },
          ],
          ...taskFilters,
          ...(cursor ? { $and: [this.cursorQuery(cursor)] } : {}),
        })
        .select(
          '_id workspaceId key title description type status priority createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(perTypeLimit)
        .lean()
        .exec();
      items.push(...tasks.map(task => this.toTaskItem(task, workspaceById)));
    }

    if (types.includes('page')) {
      const pages = await this.pageModel
        .find({
          workspaceId: { $in: workspaceIds },
          ...documentAuthorFilter,
          ...updatedAtFilter,
          $and: [
            {
              $or: [
                { searchText: normalizedRegex },
                { title: rawRegex },
                { content: rawRegex },
                { plainTextSnapshot: rawRegex },
                { slug: rawRegex },
              ],
            },
            ...(cursor ? [this.cursorQuery(cursor)] : []),
          ],
        })
        .select(
          '_id workspaceId title slug content plainTextSnapshot createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(perTypeLimit)
        .lean()
        .exec();
      items.push(...pages.map(page => this.toPageItem(page, workspaceById)));
    }

    if (types.includes('comment')) {
      items.push(
        ...(await this.searchComments(
          normalizedRegex,
          rawRegex,
          workspaceIds,
          workspaceById,
          perTypeLimit,
          cursor,
          documentAuthorFilter,
          updatedAtFilter,
        )),
      );
    }

    items.push(
      ...(await this.auxiliarySearch.search(
        types,
        normalizedRegex,
        rawRegex,
        workspaces,
        perTypeLimit,
        cursor,
      )),
    );

    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const limitedItems = items.slice(0, pageLimit);
    const hasMore = items.length > pageLimit;
    return {
      items: limitedItems,
      total: items.length,
      hasMore,
      nextCursor:
        hasMore && limitedItems.length
          ? this.encodeCursor(limitedItems[limitedItems.length - 1])
          : undefined,
    };
  }

  private async searchComments(
    normalizedRegex: RegExp,
    rawRegex: RegExp,
    workspaceIds: Types.ObjectId[],
    workspaceById: Map<string, any>,
    limit: number,
    cursor?: SearchCursor,
    documentAuthorFilter: Record<string, unknown> = {},
    updatedAtFilter: Record<string, unknown> = {},
  ): Promise<GlobalSearchItem[]> {
    const comments = await this.commentModel
      .find({
        workspaceId: { $in: workspaceIds },
        isDeleted: { $ne: true },
        $or: [{ searchText: normalizedRegex }, { content: rawRegex }],
        ...documentAuthorFilter,
        ...updatedAtFilter,
        ...(cursor ? { $and: [this.cursorQuery(cursor)] } : {}),
      })
      .select('_id workspaceId content targetType targetId createdAt updatedAt')
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec();
    const taskIds = comments
      .filter(comment => comment.targetType === 'task')
      .map(comment => comment.targetId)
      .filter(Types.ObjectId.isValid);
    const pageIds = comments
      .filter(comment => comment.targetType === 'page')
      .map(comment => comment.targetId)
      .filter(Types.ObjectId.isValid);
    const [tasks, pages] = await Promise.all([
      this.taskModel
        .find({
          _id: { $in: taskIds },
          workspaceId: { $in: workspaceIds },
          isDeleted: { $ne: true },
        })
        .select('_id workspaceId key title')
        .lean()
        .exec(),
      this.pageModel
        .find({
          _id: { $in: pageIds },
          workspaceId: { $in: workspaceIds },
        })
        .select('_id workspaceId slug title')
        .lean()
        .exec(),
    ]);
    const tasksById = new Map(tasks.map(task => [String(task._id), task]));
    const pagesById = new Map(pages.map(page => [String(page._id), page]));
    return comments.flatMap(comment => {
      const workspace = workspaceById.get(String(comment.workspaceId));
      const target =
        comment.targetType === 'task'
          ? tasksById.get(comment.targetId)
          : pagesById.get(comment.targetId);
      if (!workspace || !target) return [];
      const baseUrl =
        comment.targetType === 'task'
          ? `/workspaces/${workspace.key}/board?search=${encodeURIComponent((target as any).key)}`
          : `/workspaces/${workspace.key}/pages/${(target as any).slug}`;
      return [
        {
          id: String(comment._id),
          type: 'comment' as const,
          title: `Comment on ${target.title}`,
          description: comment.content,
          url: `${baseUrl}#comment-${comment._id}`,
          workspaceId: String(comment.workspaceId),
          workspaceName: workspace.name,
          metadata: {
            targetType: comment.targetType,
            targetId: comment.targetId,
          },
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        },
      ];
    });
  }

  private toTaskItem(
    task: any,
    workspaceById: Map<string, any>,
  ): GlobalSearchItem {
    const workspace = workspaceById.get(String(task.workspaceId));
    return {
      id: String(task._id),
      type: 'task',
      title: task.title,
      description: task.description,
      key: task.key,
      url: `/workspaces/${workspace.key}/board/key/${encodeURIComponent(task.key)}`,
      workspaceId: String(task.workspaceId),
      workspaceName: workspace.name,
      metadata: {
        status: task.status,
        priority: task.priority,
        taskType: task.type,
      },
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private toPageItem(
    page: any,
    workspaceById: Map<string, any>,
  ): GlobalSearchItem {
    const workspace = workspaceById.get(String(page.workspaceId));
    return {
      id: String(page._id),
      type: 'page',
      title: page.title || 'Untitled page',
      description: page.plainTextSnapshot || page.content,
      key: page.slug,
      url: `/workspaces/${workspace.key}/pages/${page.slug}`,
      workspaceId: String(page.workspaceId),
      workspaceName: workspace.name,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private cursorQuery(cursor: SearchCursor) {
    return {
      $or: [
        { updatedAt: { $lt: cursor.updatedAt } },
        {
          updatedAt: cursor.updatedAt,
          _id: { $lt: new Types.ObjectId(cursor.id) },
        },
      ],
    };
  }

  private decodeCursor(cursor: string): SearchCursor {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (
        !Types.ObjectId.isValid(parsed?.id) ||
        Number.isNaN(new Date(parsed?.updatedAt).getTime())
      )
        throw new Error();
      return { id: parsed.id, updatedAt: new Date(parsed.updatedAt) };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private encodeCursor(item: GlobalSearchItem) {
    return Buffer.from(
      JSON.stringify({ id: item.id, updatedAt: item.updatedAt.toISOString() }),
    ).toString('base64');
  }

  // Legacy endpoints deliberately retain their original behavior.
  async search(
    query: string,
    _userId: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const types = options?.types || ['task', 'workspace', 'page'];
    return {
      tasks: types.includes('task') ? await this.searchTasks(query) : [],
      workspaces: types.includes('workspace')
        ? await this.searchWorkspaces(query, options?.workspaceId)
        : [],
      pages: types.includes('page') ? await this.searchPages(query) : [],
    };
  }
  async searchTasks(query: string, workspaceId?: string): Promise<any[]> {
    const matchQuery: any = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { key: { $regex: query, $options: 'i' } },
      ],
    };
    if (workspaceId && Types.ObjectId.isValid(workspaceId))
      matchQuery.workspaceId = new Types.ObjectId(workspaceId);
    return this.taskModel
      .find(matchQuery)
      .select(
        '_id key title status type priority workspaceId assigneeId createdAt',
      )
      .limit(20)
      .exec();
  }
  async searchWorkspaces(query: string, workspaceId?: string): Promise<any[]> {
    const matchQuery: any = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { key: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    };
    if (workspaceId && Types.ObjectId.isValid(workspaceId))
      matchQuery._id = new Types.ObjectId(workspaceId);
    return this.workspaceModel
      .find(matchQuery)
      .select('_id name key type status createdAt')
      .limit(20)
      .exec();
  }
  async searchPages(query: string, workspaceId?: string): Promise<any[]> {
    const matchQuery: any = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { slug: { $regex: query, $options: 'i' } },
      ],
    };
    if (workspaceId && Types.ObjectId.isValid(workspaceId))
      matchQuery.workspaceId = new Types.ObjectId(workspaceId);
    return this.pageModel
      .find(matchQuery)
      .select('_id title slug workspaceId status authorId createdAt')
      .limit(20)
      .exec();
  }
}
