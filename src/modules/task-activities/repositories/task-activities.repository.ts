import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TaskActivity,
  TaskActivityDocument,
} from '../schemas/task-activity.schema';
import { TaskActivityType } from '../constants/task-activity.constants';
import { FilterTaskActivityDto } from '../dtos/filter-task-activity.dto';

export interface CreateTaskActivityData {
  workspaceId: string;
  taskId: string;
  taskKey: string;
  actorId: string;
  type: TaskActivityType;
  metadata?: Record<string, unknown>;
}

interface TaskActivityPaginatedResult {
  activities: TaskActivityDocument[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TaskActivitiesRepository {
  constructor(
    @InjectModel(TaskActivity.name)
    private readonly taskActivityModel: Model<TaskActivityDocument>,
  ) {}

  async create(data: CreateTaskActivityData): Promise<TaskActivityDocument> {
    return new this.taskActivityModel({
      workspaceId: new Types.ObjectId(data.workspaceId),
      taskId: new Types.ObjectId(data.taskId),
      taskKey: data.taskKey,
      actorId: new Types.ObjectId(data.actorId),
      type: data.type,
      metadata: data.metadata || {},
    }).save();
  }

  async findByTaskInWorkspace(
    workspaceId: string,
    taskId: string,
    filterDto: FilterTaskActivityDto = {},
  ): Promise<TaskActivityPaginatedResult> {
    const { page, limit, skip } = this.normalizePagination(filterDto);
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId)
    ) {
      return { activities: [], total: 0, page, limit };
    }

    const filter = {
      workspaceId: new Types.ObjectId(workspaceId),
      taskId: new Types.ObjectId(taskId),
    };
    const sort = this.buildSort(filterDto);

    const [activities, total] = await Promise.all([
      this.withRelations(this.taskActivityModel.find(filter))
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.taskActivityModel.countDocuments(filter).exec(),
    ]);

    return { activities, total, page, limit };
  }

  private normalizePagination(filterDto: FilterTaskActivityDto): {
    page: number;
    limit: number;
    skip: number;
  } {
    const page = Math.max(1, Number(filterDto.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filterDto.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
  }

  private buildSort(filterDto: FilterTaskActivityDto): Record<string, 1 | -1> {
    const sortBy = filterDto.sortBy === 'type' ? 'type' : 'createdAt';
    const direction = filterDto.sortOrder === 'asc' ? 1 : -1;
    return { [sortBy]: direction, _id: direction };
  }

  private withRelations(query: any) {
    return query.populate('actorId', 'fullName email avatar');
  }
}
