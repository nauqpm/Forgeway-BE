import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, FilterQuery } from 'mongoose';
import { FilterTaskDto } from '../dtos/requests/filter-task.dto';
import { Task, TaskDocument } from '../schemas/task.schema';
import { normalizeTaskKey } from '../utils/task-key.util';
import { TaskQueryBuilder } from './task-query.builder';
import {
  TaskLookupOptions,
  TaskPaginatedResult,
  TaskPaginationOptions,
} from './task-repository.types';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class TaskReadRepository extends BaseRepository<TaskDocument> {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly queryBuilder: TaskQueryBuilder,
  ) {
    super(taskModel);
  }

  override buildSoftDeleteFilter(
    includeDeleted = false,
  ): FilterQuery<TaskDocument> {
    return includeDeleted ? {} : { isDeleted: { $ne: true } };
  }

  async findTaskById(
    id: string,
    options: TaskLookupOptions = {},
    session?: ClientSession,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const query = this.taskModel.findOne({
      _id: new Types.ObjectId(id),
      ...this.queryBuilder.buildVisibilityFilter(options),
    });
    if (session) {
      query.session(session);
    }

    return this.queryBuilder.applyRelations(query).exec();
  }

  async findByKey(
    key: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    return this.queryBuilder
      .applyRelations(
        this.taskModel.findOne({
          key,
          ...this.queryBuilder.buildVisibilityFilter(options),
        }),
      )
      .exec();
  }

  async findByIdInWorkspace(
    id: string,
    workspaceId: string,
    options: TaskLookupOptions = {},
    session?: ClientSession,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    const query = this.taskModel.findOne({
      _id: new Types.ObjectId(id),
      workspaceId: new Types.ObjectId(workspaceId),
      ...this.queryBuilder.buildVisibilityFilter(options),
    });
    if (session) {
      query.session(session);
    }

    return this.queryBuilder.applyRelations(query).exec();
  }

  async findByKeyInWorkspace(
    key: string,
    workspaceId: string,
    options: TaskLookupOptions = {},
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.queryBuilder
      .applyRelations(
        this.taskModel.findOne({
          key,
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.queryBuilder.buildVisibilityFilter(options),
        }),
      )
      .exec();
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

    return this.queryBuilder
      .applyRelations(
        this.taskModel.findOne({
          _id: new Types.ObjectId(taskId),
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.queryBuilder.buildVisibilityFilter(options),
        }),
      )
      .exec();
  }

  async findDetailByKeyInWorkspace(
    taskKey: string,
    workspaceId: string,
    options: TaskLookupOptions = { includeArchived: true },
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return null;
    }

    return this.queryBuilder
      .applyRelations(
        this.taskModel.findOne({
          key: normalizeTaskKey(taskKey),
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.queryBuilder.buildVisibilityFilter(options),
        }),
      )
      .exec();
  }

  async findAll(filterDto: FilterTaskDto): Promise<TaskPaginatedResult> {
    const filter = this.queryBuilder.buildFilter(filterDto);
    const { page, limit, skip } =
      this.queryBuilder.normalizePagination(filterDto);
    const sort = this.queryBuilder.buildSort(filterDto, { createdAt: -1 });

    const [tasks, total] = await Promise.all([
      this.queryBuilder
        .applyRelations(this.taskModel.find(filter))
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

    return this.queryBuilder
      .applyRelations(
        this.taskModel.find({
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.queryBuilder.buildVisibilityFilter(),
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

    const { page, limit, skip } =
      this.queryBuilder.normalizePagination(options);
    const filter = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: true,
      isDeleted: { $ne: true },
    };
    const sort = this.queryBuilder.buildSort(options, {
      archivedAt: -1,
      updatedAt: -1,
    });

    const [tasks, total] = await Promise.all([
      this.queryBuilder
        .applyRelations(this.taskModel.find(filter))
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

    return this.queryBuilder
      .applyRelations(
        this.taskModel.find({
          workspaceId: new Types.ObjectId(workspaceId),
          ...this.queryBuilder.buildVisibilityFilter(),
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

    return this.queryBuilder
      .applyRelations(
        this.taskModel.find({
          workspaceId: new Types.ObjectId(workspaceId),
          sprintId: new Types.ObjectId(sprintId),
          ...this.queryBuilder.buildVisibilityFilter(),
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

  async findCalendarByWorkspace(
    workspaceId: string,
    startRange: Date,
    endRange: Date,
  ): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) return [];

    const wId = new Types.ObjectId(workspaceId);
    const docs = await this.queryBuilder
      .applyRelations(
        this.taskModel.find({
          workspaceId: wId,
          isDeleted: { $ne: true },
          isArchived: { $ne: true },
          $or: [
            { startDate: { $gte: startRange, $lte: endRange } },
            { dueDate: { $gte: startRange, $lte: endRange } },
            { startDate: { $lte: startRange }, dueDate: { $gte: endRange } },
            {
              startDate: { $exists: false },
              dueDate: { $gte: startRange, $lte: endRange },
            },
          ],
        }),
      )
      .exec();
    return docs as TaskDocument[];
  }

  async findTimelineByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) return [];

    const docs = await this.queryBuilder
      .applyRelations(
        this.taskModel.find({
          workspaceId: new Types.ObjectId(workspaceId),
          isDeleted: { $ne: true },
          isArchived: { $ne: true },
        }),
      )
      .exec();
    return docs as TaskDocument[];
  }
}
