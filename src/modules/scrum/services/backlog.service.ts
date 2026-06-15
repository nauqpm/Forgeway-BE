// Xử lý backlog:
// - lấy task chưa thuộc sprint
// - sort theo priority
// - hoặc trả backlog dạng grouped gồm active sprint
// - future sprints và backlog tasks.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { sortTasksByPriority } from '../utils/task-priority-sorter.util';

@Injectable()
export class BacklogService {
  constructor(
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async getBacklog(workspaceId: string, grouped = false): Promise<any> {
    const workspaceObjectId = new Types.ObjectId(workspaceId);

    if (!grouped) {
      const backlogTasks = await this.taskModel
        .find({
          workspaceId: workspaceObjectId,
          sprintId: null,
          isDeleted: { $ne: true },
          isArchived: { $ne: true },
        })
        .exec();

      return sortTasksByPriority(backlogTasks);
    }

    const [activeSprint, futureSprints, backlogTasks] = await Promise.all([
      this.sprintModel
        .findOne({
          workspaceId: workspaceObjectId,
          status: 'active',
          deletedAt: null,
        })
        .lean()
        .exec(),
      this.sprintModel
        .find({
          workspaceId: workspaceObjectId,
          status: 'planning',
          deletedAt: null,
        })
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
      this.taskModel
        .find({
          workspaceId: workspaceObjectId,
          sprintId: null,
          isDeleted: { $ne: true },
          isArchived: { $ne: true },
        })
        .lean()
        .exec(),
    ]);

    const sprintIds: Types.ObjectId[] = [];

    if (activeSprint?._id) {
      sprintIds.push(activeSprint._id);
    }

    for (const sprint of futureSprints) {
      sprintIds.push(sprint._id);
    }

    const tasksBySprintId = new Map<string, any[]>();

    if (sprintIds.length > 0) {
      const sprintTasks = await this.taskModel
        .find({
          workspaceId: workspaceObjectId,
          sprintId: { $in: sprintIds },
          isDeleted: { $ne: true },
          isArchived: { $ne: true },
        })
        .lean()
        .exec();

      const sortedSprintTasks = sortTasksByPriority(sprintTasks);

      for (const task of sortedSprintTasks) {
        const key = task.sprintId?.toString();
        if (!key) continue;

        if (!tasksBySprintId.has(key)) {
          tasksBySprintId.set(key, []);
        }

        tasksBySprintId.get(key)?.push(task);
      }
    }

    return {
      activeSprint: activeSprint
        ? {
            ...activeSprint,
            tasks: tasksBySprintId.get(activeSprint._id.toString()) ?? [],
          }
        : null,
      futureSprints: futureSprints.map(sprint => ({
        ...sprint,
        tasks: tasksBySprintId.get(sprint._id.toString()) ?? [],
      })),
      backlogTasks: sortTasksByPriority(backlogTasks),
    };
  }
}
