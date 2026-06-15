import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../schemas/task.schema';
import { TaskQueryBuilder } from './task-query.builder';
import { MoveTaskData, TaskRankScope } from './task-repository.types';

@Injectable()
export class TaskRankRepository {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly queryBuilder: TaskQueryBuilder,
  ) {}

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
          ...this.queryBuilder.buildVisibilityFilter(),
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
      ...this.queryBuilder.buildVisibilityFilter(),
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
      .find(this.queryBuilder.buildRankScopeFilter(scope))
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
            ...this.queryBuilder.buildVisibilityFilter(),
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

  private withRelations(query: any) {
    return this.queryBuilder.applyRelations(query);
  }
}
