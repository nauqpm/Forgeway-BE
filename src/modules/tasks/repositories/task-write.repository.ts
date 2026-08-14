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

  async updateSprintForSubtasksByParentId(
    parentId: string,
    sprintId: string | null,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(parentId)) return;

    const sprintValue =
      sprintId && Types.ObjectId.isValid(sprintId)
        ? new Types.ObjectId(sprintId)
        : null;

    await this.taskModel.updateMany(
      {
        parentId: new Types.ObjectId(parentId),
        isDeleted: { $ne: true },
      },
      sprintValue
        ? { $set: { sprintId: sprintValue }, $inc: { version: 1 } }
        : { $unset: { sprintId: 1 }, $inc: { version: 1 } },
    );
  }

  async claimParentForChildCreation(
    parentId: string,
    workspaceId: string,
    parentVersion: number,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(parentId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      return null;
    }

    return this.taskModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(parentId),
          workspaceId: new Types.ObjectId(workspaceId),
          version: parentVersion,
          // Subtask nesting and epic-child creation are forbidden;
          // if parent has been concurrently converted, fail here.
          type: { $nin: ['subtask', 'epic'] },
          isDeleted: { $ne: true },
        },
        { $inc: { version: 1 } },
        { new: false }, // return pre-update doc so caller can inspect old state
      )
      .exec();
  }

  async convertToTask(
    subtaskId: string,
    workspaceId: string,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(subtaskId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(subtaskId),
          workspaceId: new Types.ObjectId(workspaceId),
          isDeleted: { $ne: true },
        },
        {
          $set: { type: 'task' },
          $unset: { parentId: 1 },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async convertToSubtask(
    taskId: string,
    workspaceId: string,
    parentObjectId: Types.ObjectId,
    parentSprintId?: Types.ObjectId,
    taskVersion?: number,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      return null;
    }

    return this.withRelations(
      this.taskModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(taskId),
          workspaceId: new Types.ObjectId(workspaceId),
          isDeleted: { $ne: true },
          // OCC: only match when no concurrent modification touched this task.
          ...(taskVersion !== undefined ? { version: taskVersion } : {}),
        },
        {
          $set: {
            type: 'subtask',
            parentId: parentObjectId,
            ...(parentSprintId ? { sprintId: parentSprintId } : {}),
          },
          $unset: {
            epicId: 1,
            storyPoints: 1,
            ...(!parentSprintId ? { sprintId: 1 } : {}),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ),
    ).exec();
  }

  async softDeleteSubtasksByParentId(
    parentId: string,
    workspaceId: string,
    deletedBy: string,
  ): Promise<TaskDocument[]> {
    if (
      !Types.ObjectId.isValid(parentId) ||
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(deletedBy)
    ) {
      return [];
    }

    // Lấy danh sách subtask trước để trả về cho caller ghi audit
    const subtasks = await this.withRelations(
      this.taskModel.find({
        parentId: new Types.ObjectId(parentId),
        workspaceId: new Types.ObjectId(workspaceId),
        type: 'subtask',
        isDeleted: { $ne: true },
      }),
    ).exec();

    if (subtasks.length === 0) return [];

    const subtaskIds = subtasks.map(s => s._id);
    await this.taskModel.updateMany(
      { _id: { $in: subtaskIds } },
      {
        $set: {
          isArchived: true,
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: new Types.ObjectId(deletedBy),
        },
        $inc: { version: 1 },
      },
    );

    // Return post-update documents so callers emit audit/events with the
    // correct deleted state (consistent with softDeleteInWorkspace).
    return this.withRelations(
      this.taskModel.find({
        _id: { $in: subtaskIds },
        isDeleted: true,
      }),
    ).exec();
  }
}
