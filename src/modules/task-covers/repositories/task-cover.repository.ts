import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { TaskCover } from '../interfaces/task-cover.interface';

@Injectable()
export class TaskCoverRepository {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async findTaskInWorkspace(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId)
    ) {
      return null;
    }

    return this.taskModel
      .findOne({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();
  }

  async setCover(
    workspaceId: string,
    taskId: string,
    cover: TaskCover,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId)
    ) {
      return null;
    }

    return this.taskModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(taskId),
          workspaceId: new Types.ObjectId(workspaceId),
          isDeleted: { $ne: true },
        },
        {
          $set: {
            cover: {
              ...cover,
              updatedBy: cover.updatedBy
                ? new Types.ObjectId(cover.updatedBy)
                : undefined,
            },
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
  }

  async removeCover(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId)
    ) {
      return null;
    }

    return this.taskModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(taskId),
          workspaceId: new Types.ObjectId(workspaceId),
          isDeleted: { $ne: true },
        },
        {
          $unset: { cover: 1 },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
  }
}
