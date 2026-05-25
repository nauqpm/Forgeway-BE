import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { FilterTaskDto } from '../dtos/requests/create-task.dto';
import { Task, TaskDocument } from '../schemas/task.schema';

interface TaskLookupOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
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

  async findAll(filterDto: FilterTaskDto): Promise<{
    tasks: TaskDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter = this.buildFilter(filterDto);
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 20;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      this.withRelations(this.taskModel.find(filter))
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
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

  async findArchivedByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }

    return this.withRelations(
      this.taskModel.find({
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: true,
        isDeleted: { $ne: true },
      }),
    )
      .sort({ archivedAt: -1, updatedAt: -1 })
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
        data,
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
        data,
        {
          new: true,
          runValidators: true,
        },
      ),
    ).exec();
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
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async softDelete(id: string, deletedBy: string): Promise<TaskDocument | null> {
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
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  private buildFilter(filterDto: FilterTaskDto): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = filterDto.archived
      ? { isArchived: true, isDeleted: { $ne: true } }
      : this.buildVisibilityFilter();

    if (filterDto.workspaceId) {
      filter.workspaceId = new Types.ObjectId(filterDto.workspaceId);
    }

    if (filterDto.backlog) {
      filter.$or = [
        { sprintId: null },
        { sprintId: { $exists: false } },
      ];
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
    if (filterDto.type) {
      filter.type = filterDto.type;
    }
    if (filterDto.priority) {
      filter.priority = filterDto.priority;
    }
    if (filterDto.status) {
      filter.status = filterDto.status;
    }
    if (filterDto.search) {
      filter.$text = { $search: filterDto.search };
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

  private withRelations(query: any) {
    return query
      .populate('workspaceId', 'key name type')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'name startDate endDate')
      .populate('boardId', 'name');
  }
}
