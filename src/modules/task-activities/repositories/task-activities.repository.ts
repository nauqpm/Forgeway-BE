import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TaskActivity,
  TaskActivityDocument,
} from '../schemas/task-activity.schema';
import { TaskActivityType } from '../constants/task-activity.constants';

export interface CreateTaskActivityData {
  workspaceId: string;
  taskId: string;
  taskKey: string;
  actorId: string;
  type: TaskActivityType;
  metadata?: Record<string, unknown>;
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
  ): Promise<TaskActivityDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(taskId)) {
      return [];
    }

    return this.withRelations(
      this.taskActivityModel.find({
        workspaceId: new Types.ObjectId(workspaceId),
        taskId: new Types.ObjectId(taskId),
      }),
    )
      .sort({ createdAt: -1 })
      .exec();
  }

  private withRelations(query: any) {
    return query.populate('actorId', 'fullName email avatar');
  }
}
