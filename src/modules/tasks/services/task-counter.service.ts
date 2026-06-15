import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MongoServerError } from 'mongodb';
import { Model, Types } from 'mongoose';
import {
  TaskCounter,
  TaskCounterDocument,
} from '../schemas/task-counter.schema';
import { Task, TaskDocument } from '../schemas/task.schema';

@Injectable()
export class TaskCounterService {
  constructor(
    @InjectModel(TaskCounter.name)
    private readonly taskCounterModel: Model<TaskCounterDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async nextSequence(workspaceId: string): Promise<number> {
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const existingCounter =
      await this.incrementExistingCounter(workspaceObjectId);
    if (existingCounter) {
      return existingCounter.taskSequence;
    }

    await this.initializeCounter(workspaceObjectId);
    const initializedCounter =
      await this.incrementExistingCounter(workspaceObjectId);
    if (!initializedCounter) {
      throw new Error('Failed to initialize task counter');
    }

    return initializedCounter.taskSequence;
  }

  private async incrementExistingCounter(
    workspaceId: Types.ObjectId,
  ): Promise<TaskCounterDocument | null> {
    return this.taskCounterModel
      .findOneAndUpdate(
        { workspaceId },
        { $inc: { taskSequence: 1 } },
        { new: true },
      )
      .exec();
  }

  private async initializeCounter(workspaceId: Types.ObjectId): Promise<void> {
    const existingTaskCount = await this.taskModel
      .countDocuments({ workspaceId })
      .exec();

    try {
      await this.taskCounterModel.create({
        workspaceId,
        taskSequence: existingTaskCount,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        return;
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
  }
}
