// Xử lý di chuyển task:
// - move tasks vào sprint
// - move tasks về backlog
// - kiểm tra task có thuộc workspace không
// - chặn di chuyển task ra khỏi completed sprint nếu không phải super admin.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';

@Injectable()
export class SprintTaskMovementService {
  constructor(
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async moveTasksToSprint(
    workspaceId: string,
    sprintId: string,
    taskIds: string[],
    isSuperAdmin = false,
  ): Promise<{ modifiedCount: number }> {
    if (!taskIds?.length) {
      throw new BadRequestException('taskIds is required');
    }

    await this.ensureTaskWorkspaceOwnership(workspaceId, taskIds);

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const sprint = await this.sprintModel
      .findOne({
        _id: new Types.ObjectId(sprintId),
        workspaceId: workspaceObjectId,
        deletedAt: null,
      })
      .exec();

    if (!sprint) {
      throw new NotFoundException('Sprint not exist');
    }

    if (sprint.status === 'completed') {
      throw new BadRequestException('Cant move tasks into completed sprint');
    }

    const taskObjectIds = taskIds.map(taskId => new Types.ObjectId(taskId));
    if (!isSuperAdmin) {
      await this.ensureNoTasksFromCompletedSprint(
        workspaceObjectId,
        taskObjectIds,
      );
    }

    const result = await this.taskModel
      .updateMany(
        {
          _id: { $in: taskObjectIds },
          workspaceId: workspaceObjectId,
        },
        { $set: { sprintId: sprint._id } },
      )
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  async moveTasksToBacklog(
    workspaceId: string,
    taskIds: string[],
    isSuperAdmin = false,
  ): Promise<{ modifiedCount: number }> {
    if (!taskIds?.length) {
      throw new BadRequestException('taskIds is required');
    }

    await this.ensureTaskWorkspaceOwnership(workspaceId, taskIds);

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const taskObjectIds = taskIds.map(taskId => new Types.ObjectId(taskId));
    if (!isSuperAdmin) {
      await this.ensureNoTasksFromCompletedSprint(
        workspaceObjectId,
        taskObjectIds,
      );
    }

    const result = await this.taskModel
      .updateMany(
        {
          _id: { $in: taskObjectIds },
          workspaceId: workspaceObjectId,
        },
        {
          $set: {
            sprintId: null,
            columnId: 'todo',
            status: 'todo',
          },
        },
      )
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  private async ensureTaskWorkspaceOwnership(
    workspaceId: string,
    taskIds: string[],
  ): Promise<void> {
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const uniqueTaskIds = [...new Set(taskIds)];
    const taskObjectIds = uniqueTaskIds.map(
      taskId => new Types.ObjectId(taskId),
    );

    const count = await this.taskModel
      .countDocuments({
        _id: { $in: taskObjectIds },
        workspaceId: workspaceObjectId,
        isDeleted: { $ne: true },
        isArchived: { $ne: true },
      })
      .exec();

    if (count !== uniqueTaskIds.length) {
      throw new BadRequestException(
        'One or more taskIds do not exist, have been deleted, have been archived, or do not belong to this workspace',
      );
    }
  }

  private async ensureNoTasksFromCompletedSprint(
    workspaceId: Types.ObjectId,
    taskObjectIds: Types.ObjectId[],
  ): Promise<void> {
    const tasks = await this.taskModel
      .find({
        _id: { $in: taskObjectIds },
        workspaceId,
        sprintId: { $ne: null },
      })
      .select({ sprintId: 1 })
      .lean()
      .exec();

    const sprintIds = [
      ...new Set(tasks.map(task => task.sprintId?.toString()).filter(Boolean)),
    ].map(id => new Types.ObjectId(id));

    if (!sprintIds.length) {
      return;
    }

    const completedSprint = await this.sprintModel
      .findOne({
        _id: { $in: sprintIds },
        workspaceId,
        status: 'completed',
        deletedAt: null,
      })
      .lean()
      .exec();

    if (completedSprint) {
      throw new BadRequestException(
        'Cant move tasks out of completed sprint without super_admin permission',
      );
    }
  }
}
