import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import { FilterTaskDto } from '../dtos/requests/create-task.dto';
import { Task, TaskDocument } from '../schemas/task.schema';
import { TaskSearchService } from '../services/task-search.service';
import { normalizeTaskKey } from '../utils/task-key.util';

interface TaskLookupOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

interface MoveTaskData {
  columnId?: string;
  status?: string;
  sprintId?: string | null;
  rank?: string;
}

interface TaskRankScope {
  workspaceId: string;
  columnId?: string;
  sprintId?: string | null;
}

interface TaskPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | string;
}

interface TaskPaginatedResult {
  tasks: TaskDocument[];
  total: number;
  page: number;
  limit: number;
}

const TASK_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'key',
  'priority',
  'status',
  'rank',
  'archivedAt',
]);

@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly taskSearchService: TaskSearchService,
  ) {}

  async create(data: Partial<Task>): Promise<TaskDocument> {
    return new this.taskModel(data).save();
  }

  async findById(
    id: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOne({
        _id: new Types.ObjectId(id),
        ...this.buildVisibilityFilter(options),
      }),
    ).exec();
  }

  async findByKey(
    key: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    return this.withRelations(
      this.taskModel.findOne({
        key,
        ...this.buildVisibilityFilter(options),
      }),
    ).exec();
  }

  async findByIdInWorkspace(
    id: string,
    workspaceId: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOne({
        _id: new Types.ObjectId(id),
        workspaceId: new Types.ObjectId(workspaceId),
        ...this.buildVisibilityFilter(options),
      }),
    ).exec();
  }

  async findByKeyInWorkspace(
    key: string,
    workspaceId: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOne({
        key,
        workspaceId: new Types.ObjectId(workspaceId),
        ...this.buildVisibilityFilter(options),
      }),
    ).exec();
  }

  async findByWorkspaceAndKey(
    workspaceId: string,
    key: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    return this.findByKeyInWorkspace(key, workspaceId, options);
  }

  async findDetailByIdInWorkspace(
    taskId: string,
    workspaceId: string,
    options: TaskLookupOptions = { includeArchived: true },
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOne({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        ...this.buildVisibilityFilter(options),
      }),
    ).exec();
  }

  async findDetailByKeyInWorkspace(
    taskKey: string,
    workspaceId: string,
    options: TaskLookupOptions = { includeArchived: true },
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOne({
        key: normalizeTaskKey(taskKey),
        workspaceId: new Types.ObjectId(workspaceId),
        ...this.buildVisibilityFilter(options),
      }),
    ).exec();
  }

  async findAll(filterDto: FilterTaskDto): Promise<TaskPaginatedResult> {
    const filter = this.buildFilter(filterDto);
    const { page, limit, skip } = this.normalizePagination(filterDto);
    const sort = this.buildSort(filterDto, { createdAt: -1 });

    const [tasks, total] = await Promise.all([
      this.withRelations(this.taskModel.find(filter))
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.taskModel.countDocuments(filter).exec(),
    ]);

    return { tasks, total, page, limit };
  }

  async findByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }

    return this.withRelations(
      this.taskModel.find({
        workspaceId: new Types.ObjectId(workspaceId),
        ...this.buildVisibilityFilter(),
      }),
    )
      .sort({ createdAt: -1 })
      .exec();
  }

  async findArchivedByWorkspace(
    workspaceId: string,
    options: TaskPaginationOptions = {},
  ): Promise<TaskPaginatedResult> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return {
        tasks: [],
        total: 0,
        page: options.page || 1,
        limit: options.limit || 20,
      };
    }

    const { page, limit, skip } = this.normalizePagination(options);
    const filter: FilterQuery<TaskDocument> = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: true,
      isDeleted: { $ne: true },
    };
    const sort = this.buildSort(options, { archivedAt: -1, updatedAt: -1 });

    const [tasks, total] = await Promise.all([
      this.withRelations(this.taskModel.find(filter))
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.taskModel.countDocuments(filter).exec(),
    ]);

    return { tasks, total, page, limit };
  }

  async findBacklogByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }

    return this.withRelations(
      this.taskModel.find({
        workspaceId: new Types.ObjectId(workspaceId),
        ...this.buildVisibilityFilter(),
        $or: [{ sprintId: null }, { sprintId: { $exists: false } }],
      }),
    )
      .sort({ createdAt: -1 })
      .exec();
  }

  async findBySprintInWorkspace(
    workspaceId: string,
    sprintId: string,
  ): Promise<TaskDocument[]> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(sprintId)
    ) {
      return [];
    }

    return this.withRelations(
      this.taskModel.find({
        workspaceId: new Types.ObjectId(workspaceId),
        sprintId: new Types.ObjectId(sprintId),
        ...this.buildVisibilityFilter(),
      }),
    )
      .sort({ createdAt: -1 })
      .exec();
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return 0;
    }

    return this.taskModel
      .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
  }

  async update(id: string, data: Partial<Task>): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ...this.buildVisibilityFilter(),
        },
        this.buildVersionedSetUpdate(data),
        {
          new: true,
          runValidators: true,
        },
      ),
    ).exec();
  }

  async updateInWorkspace(
    id: string,
    workspaceId: string,
    data: Partial<Task>,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.buildVisibilityFilter(),
        },
        this.buildVersionedSetUpdate(data),
        {
          new: true,
          runValidators: true,
        },
      ),
    ).exec();
  }

  async moveTaskInWorkspace(
    id: string,
    workspaceId: string,
    data: MoveTaskData,
    session?: ClientSession,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    const update: Record<string, Record<string, unknown>> = {};

    if (data.columnId !== undefined) {
      update.$set = { ...update.$set, columnId: data.columnId };
    }
    if (data.status !== undefined) {
      update.$set = { ...update.$set, status: data.status };
    }
    if (data.rank !== undefined) {
      update.$set = { ...update.$set, rank: data.rank };
    }
    if (data.sprintId !== undefined) {
      if (data.sprintId === null) {
        update.$unset = { ...update.$unset, sprintId: 1 };
      } else {
        update.$set = {
          ...update.$set,
          sprintId: new Types.ObjectId(data.sprintId),
        };
      }
    }

    update.$inc = { ...update.$inc, version: 1 };

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.buildVisibilityFilter(),
        },
        update,
        {
          new: true,
          runValidators: true,
          session,
        },
      ),
    ).exec();
  }

  async findNeighborForReorder(
    taskId: string,
    workspaceId: string,
    session?: ClientSession,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      return null;
    }

    const query = this.taskModel.findOne({
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      ...this.buildVisibilityFilter(),
    });
    if (session) {
      query.session(session);
    }

    return this.withRelations(query).exec();
  }

  async findTasksInRankScope(
    scope: TaskRankScope,
    session?: ClientSession,
  ): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(scope.workspaceId)) {
      return [];
    }

    const query = this.taskModel
      .find(this.buildRankScopeFilter(scope))
      .sort({ rank: 1, createdAt: 1 });
    if (session) {
      query.session(session);
    }

    return this.withRelations(query).exec();
  }

  async reorderTaskInWorkspace(
    id: string,
    workspaceId: string,
    data: MoveTaskData,
    session?: ClientSession,
  ): Promise<TaskDocument | null> {
    return this.moveTaskInWorkspace(id, workspaceId, data, session);
  }

  async updateRanksInWorkspace(
    workspaceId: string,
    rankUpdates: Array<{ taskId: string; rank: string }>,
    session?: ClientSession,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId) || rankUpdates.length === 0) {
      return;
    }

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const operations = rankUpdates
      .filter(update => Types.ObjectId.isValid(update.taskId))
      .map(update => ({
        updateOne: {
          filter: {
            _id: new Types.ObjectId(update.taskId),
            workspaceId: workspaceObjectId,
            ...this.buildVisibilityFilter(),
          },
          update: {
            $set: { rank: update.rank },
            $inc: { version: 1 },
          },
        },
      }));

    if (operations.length === 0) {
      return;
    }

    await this.taskModel.bulkWrite(operations, { session });
  }

  async archive(id: string, archivedBy: string): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ...this.buildVisibilityFilter({ includeArchived: true }),
        },
        {
          $set: {
            isArchived: true,
            archivedAt: new Date(),
            archivedBy: new Types.ObjectId(archivedBy),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async archiveInWorkspace(
    id: string,
    workspaceId: string,
    archivedBy: string,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(id) ||
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(archivedBy)
    ) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.buildVisibilityFilter({ includeArchived: true }),
        },
        {
          $set: {
            isArchived: true,
            archivedAt: new Date(),
            archivedBy: new Types.ObjectId(archivedBy),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async restore(id: string): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          isArchived: true,
          isDeleted: { $ne: true },
        },
        {
          $set: { isArchived: false },
          $unset: { archivedAt: 1, archivedBy: 1 },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async restoreInWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          workspaceId: new Types.ObjectId(workspaceId),
          isArchived: true,
          isDeleted: { $ne: true },
        },
        {
          $set: { isArchived: false },
          $unset: { archivedAt: 1, archivedBy: 1 },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async softDelete(
    id: string,
    deletedBy: string,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          isDeleted: { $ne: true },
        },
        {
          $set: {
            isArchived: true,
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: new Types.ObjectId(deletedBy),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async softDeleteInWorkspace(
    id: string,
    workspaceId: string,
    deletedBy: string,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(id) ||
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(deletedBy)
    ) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          workspaceId: new Types.ObjectId(workspaceId),
          isDeleted: { $ne: true },
        },
        {
          $set: {
            isArchived: true,
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: new Types.ObjectId(deletedBy),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  private buildVersionedSetUpdate(
    data: Partial<Task>,
  ): Record<string, unknown> {
    return {
      $set: data,
      $inc: { version: 1 },
    };
  }

  private normalizePagination(options: TaskPaginationOptions): {
    page: number;
    limit: number;
    skip: number;
  } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
  }

  private buildSort(
    options: TaskPaginationOptions,
    defaultSort: Record<string, 1 | -1>,
  ): Record<string, 1 | -1> {
    const sortBy =
      options.sortBy && TASK_SORT_FIELDS.has(options.sortBy)
        ? options.sortBy
        : undefined;
    const direction = options.sortOrder === 'asc' ? 1 : -1;

    if (!sortBy) {
      return defaultSort;
    }

    return { [sortBy]: direction, _id: direction };
  }

  private buildFilter(filterDto: FilterTaskDto): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = filterDto.archived
      ? { isArchived: true, isDeleted: { $ne: true } }
      : this.buildVisibilityFilter();

    if (filterDto.workspaceId) {
      filter.workspaceId = new Types.ObjectId(filterDto.workspaceId);
    }

    if (filterDto.backlog) {
      filter.$or = [{ sprintId: null }, { sprintId: { $exists: false } }];
    } else if (filterDto.sprintId) {
      filter.sprintId = new Types.ObjectId(filterDto.sprintId);
    }
    if (filterDto.boardId) {
      filter.boardId = new Types.ObjectId(filterDto.boardId);
    }
    if (filterDto.columnId) {
      filter.columnId = filterDto.columnId;
    }
    if (filterDto.assigneeId) {
      filter.assigneeId = new Types.ObjectId(filterDto.assigneeId);
    }
    if (filterDto.reporterId) {
      filter.reporterId = new Types.ObjectId(filterDto.reporterId);
    }
    if (filterDto.labelIds?.length) {
      filter.labelIds = {
        $all: filterDto.labelIds.map(labelId => new Types.ObjectId(labelId)),
      };
    }
    if (filterDto.taskKey) {
      filter.key = normalizeTaskKey(filterDto.taskKey);
      return filter;
    }
    if (filterDto.type) {
      filter.type = filterDto.type;
    }
    if (filterDto.priority) {
      filter.priority = filterDto.priority;
    }
    if (filterDto.status?.length) {
      filter.status = { $in: filterDto.status };
    }
    if (filterDto.search) {
      Object.assign(
        filter,
        this.taskSearchService.buildSearchFilter(filterDto.search),
      );
    }

    return filter;
  }

  private buildVisibilityFilter(
    options: TaskLookupOptions = {},
  ): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {};

    if (!options.includeArchived) {
      filter.isArchived = { $ne: true };
    }
    if (!options.includeDeleted) {
      filter.isDeleted = { $ne: true };
    }

    return filter;
  }

  private buildRankScopeFilter(
    scope: TaskRankScope,
  ): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {
      workspaceId: new Types.ObjectId(scope.workspaceId),
      ...this.buildVisibilityFilter(),
    };

    if (scope.columnId) {
      filter.columnId = scope.columnId;
    }

    if (scope.sprintId === null) {
      filter.$or = [{ sprintId: null }, { sprintId: { $exists: false } }];
    } else if (scope.sprintId) {
      filter.sprintId = new Types.ObjectId(scope.sprintId);
    }

    return filter;
  }

  async findCalendarByWorkspace(
    workspaceId: string,
    startRange: Date,
    endRange: Date,
  ): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) return [];
    const wId = new Types.ObjectId(workspaceId);
    const docs = await this.withRelations(
      this.taskModel.find({
        workspaceId: wId,
        isDeleted: { $ne: true },
        isArchived: { $ne: true },
        $or: [
          // task starts within the range
          { startDate: { $gte: startRange, $lte: endRange } },
          // task ends within the range
          { dueDate: { $gte: startRange, $lte: endRange } },
          // task spans the entire range
          { startDate: { $lte: startRange }, dueDate: { $gte: endRange } },
          // tasks with only dueDate set, within range
          {
            startDate: { $exists: false },
            dueDate: { $gte: startRange, $lte: endRange },
          },
        ],
      }),
    ).exec();
    return docs as TaskDocument[];
  }

  async findTimelineByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) return [];
    const docs = await this.withRelations(
      this.taskModel.find({
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
        isArchived: { $ne: true },
      }),
    ).exec();
    return docs as TaskDocument[];
  }

  private withRelations(query: any) {
    return query
      .populate('workspaceId', 'key name type')
      .populate('assigneeId', 'fullName email avatar')
      .populate('reporterId', 'fullName email avatar')
      .populate('archivedBy', 'fullName email avatar')
      .populate('sprintId', 'name startDate endDate')
      .populate('boardId', 'name')
      .populate('labelIds', 'name');
  }
}
