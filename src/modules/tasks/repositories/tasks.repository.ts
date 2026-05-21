import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { FilterTaskDto } from '../dtos/requests/create-task.dto';
import { Task, TaskDocument } from '../schemas/task.schema';

@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async create(data: Partial<Task>): Promise<TaskDocument> {
    return new this.taskModel(data).save();
  }

  async findById(id: string): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(this.taskModel.findById(id)).exec();
  }

  async findByKey(key: string): Promise<TaskDocument | null> {
    return this.withRelations(this.taskModel.findOne({ key })).exec();
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
      this.taskModel.find({ workspaceId: new Types.ObjectId(workspaceId) }),
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
      this.taskModel.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      }),
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await this.taskModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  private buildFilter(filterDto: FilterTaskDto): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {};

    if (filterDto.workspaceId) {
      filter.workspaceId = new Types.ObjectId(filterDto.workspaceId);
    }
    if (filterDto.sprintId) {
      filter.sprintId = new Types.ObjectId(filterDto.sprintId);
    }
    if (filterDto.boardId) {
      filter.boardId = new Types.ObjectId(filterDto.boardId);
    }
    if (filterDto.columnId || filterDto.boardColumnId || filterDto.status) {
      filter.columnId =
        filterDto.columnId || filterDto.boardColumnId || filterDto.status;
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
    if (filterDto.search) {
      filter.$text = { $search: filterDto.search };
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
