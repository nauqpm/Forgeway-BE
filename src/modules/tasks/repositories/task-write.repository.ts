import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { Task, TaskDocument } from '../schemas/task.schema';
import { TaskQueryBuilder } from './task-query.builder';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class TaskWriteRepository extends BaseRepository<TaskDocument> {
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

  async create(data: Partial<Task>): Promise<TaskDocument> {
    return new this.taskModel(data).save();
  }

  async update(id: string, data: Partial<Task>): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ...this.queryBuilder.buildVisibilityFilter(),
        },
        this.queryBuilder.buildVersionedSetUpdate(
          data as Record<string, unknown>,
        ),
        { new: true, runValidators: true },
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
          ...this.queryBuilder.buildVisibilityFilter(),
        },
        this.queryBuilder.buildVersionedSetUpdate(
          data as Record<string, unknown>,
        ),
        { new: true, runValidators: true },
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
          ...this.queryBuilder.buildVisibilityFilter({ includeArchived: true }),
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
          ...this.queryBuilder.buildVisibilityFilter({ includeArchived: true }),
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

  private withRelations(query: any) {
    return this.queryBuilder.applyRelations(query);
  }
}
