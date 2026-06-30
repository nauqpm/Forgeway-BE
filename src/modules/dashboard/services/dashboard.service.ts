import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task } from '../../tasks/schemas/task.schema';
import { Workspace } from '../../workspaces/schemas/workspace.schema';
import { Sprint } from '../../scrum/schemas/sprint.schema';
import { Page } from '../../pages/schemas/page.schema';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(Workspace.name) private workspaceModel: Model<Workspace>,
    @InjectModel(Sprint.name) private sprintModel: Model<Sprint>,
    @InjectModel(Page.name) private pageModel: Model<Page>,
  ) {}

  async getWorkspaceOverview(workspaceId: string, userId: string) {
    this.logger.log(
      `Getting workspace overview for workspaceId: ${workspaceId}, userId: ${userId}`,
    );

    const workspaceObjectId = new Types.ObjectId(workspaceId);

    const workspace = await this.workspaceModel.findById(workspaceObjectId, {
      _id: 1,
    });
    const workspaceIds = workspace ? [workspace._id] : [];

    // Get total tasks across all Workspaces
    const totalTasks = await this.taskModel.countDocuments({
      workspaceId: { $in: workspaceIds },
    });

    // Tasks by status
    const tasksByStatus = await this.taskModel.aggregate([
      { $match: { workspaceId: { $in: workspaceIds } } },
      { $group: { _id: '$columnId', count: { $sum: 1 } } },
    ]);

    // Tasks by type
    const tasksByType = await this.taskModel.aggregate([
      { $match: { workspaceId: { $in: workspaceIds } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    // Tasks by priority
    const tasksByPriority = await this.taskModel.aggregate([
      { $match: { workspaceId: { $in: workspaceIds } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);

    // Recent tasks
    const recentTasks = await this.taskModel
      .find({ workspaceId: { $in: workspaceIds } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title key columnId type createdAt')
      .exec();

    // My tasks (assigned to current user) — all tasks sorted by due date ascending, nulls last
    const myTasks = await this.taskModel
      .find({
        workspaceId: { $in: workspaceIds },
        assigneeId: new Types.ObjectId(userId),
      })
      .sort({ dueDate: 1 })
      .select('title key columnId type priority workspaceId createdAt dueDate')
      .exec();

    // Active sprints
    const activeSprints = await this.sprintModel.countDocuments({
      workspaceId: workspaceObjectId,
      status: 'active',
    });

    return {
      totalWorkspaces: workspace ? 1 : 0,
      totalTasks,
      tasksByStatus,
      tasksByType,
      tasksByPriority,
      recentTasks,
      myTasks,
      activeSprints,
    };
  }

  async getWorkspaceStats(workspaceId: string) {
    this.logger.log(`Getting Workspace stats for workspaceId: ${workspaceId}`);

    const workspaceObjectId = new Types.ObjectId(workspaceId);

    const totalTasks = await this.taskModel.countDocuments({
      workspaceId: workspaceObjectId,
    });

    const completedTasks = await this.taskModel.countDocuments({
      workspaceId: workspaceObjectId,
      columnId: 'done',
    });

    const inProgressTasks = await this.taskModel.countDocuments({
      workspaceId: workspaceObjectId,
      columnId: { $in: ['inprogress', 'in_progress'] },
    });

    const todoTasks = await this.taskModel.countDocuments({
      workspaceId: workspaceObjectId,
      columnId: 'todo',
    });

    const tasksByStatus = await this.taskModel.aggregate([
      { $match: { workspaceId: workspaceObjectId } },
      { $group: { _id: '$columnId', count: { $sum: 1 } } },
    ]);

    const tasksByType = await this.taskModel.aggregate([
      { $match: { workspaceId: workspaceObjectId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    const tasksByPriority = await this.taskModel.aggregate([
      { $match: { workspaceId: workspaceObjectId } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);

    const tasksByAssignee = await this.taskModel.aggregate([
      { $match: { workspaceId: workspaceObjectId, assigneeId: { $ne: null } } },
      {
        $group: {
          _id: '$assigneeId',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          count: 1,
          user: {
            _id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            avatarUrl: '$user.avatarUrl',
          },
        },
      },
    ]);

    // Sprint progress
    const activeSprint = await this.sprintModel.findOne({
      workspaceId: workspaceObjectId,
      status: 'active',
    });

    let sprintProgress: any = null;
    if (activeSprint) {
      const sprintTasks = await this.taskModel
        .find({
          workspaceId: workspaceObjectId,
          sprintId: activeSprint._id,
        })
        .select('storyPoints columnId')
        .exec();

      const totalPoints = sprintTasks.reduce(
        (sum, task) => sum + (task.storyPoints || 0),
        0,
      );
      const completedPoints = sprintTasks
        .filter(task => task.columnId === 'done')
        .reduce((sum, task) => sum + (task.storyPoints || 0), 0);

      sprintProgress = {
        sprintId: activeSprint._id.toString(),
        sprintName: `Sprint ${activeSprint._id.toString().substring(activeSprint._id.toString().length - 4)}`,
        totalStoryPoints: totalPoints,
        completedStoryPoints: completedPoints,
        completionPercentage:
          totalPoints > 0
            ? Math.round((completedPoints / totalPoints) * 100)
            : 0,
      };
    }

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      tasksByStatus,
      tasksByType,
      tasksByPriority,
      tasksByAssignee,
      sprintProgress,
    };
  }

  async getUserStats(userId: string) {
    this.logger.log(`Getting user stats for userId: ${userId}`);

    const userObjectId = new Types.ObjectId(userId);

    const tasksAssigned = await this.taskModel.countDocuments({
      assigneeId: userObjectId,
    });

    const tasksByStatus = await this.taskModel.aggregate([
      { $match: { assigneeId: userObjectId } },
      { $group: { _id: '$columnId', count: { $sum: 1 } } },
    ]);

    const tasksByPriority = await this.taskModel.aggregate([
      { $match: { assigneeId: userObjectId } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);

    const recentlyCompleted = await this.taskModel
      .find({
        assigneeId: userObjectId,
        columnId: 'done',
      })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('title key type priority workspaceId completedAt')
      .populate('workspaceId', 'name key')
      .exec();

    const recentActivity = await this.taskModel
      .find({
        $or: [{ createdBy: userObjectId }, { updatedBy: userObjectId }],
      })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select(
        'title key columnId type priority workspaceId createdAt updatedAt createdBy updatedBy',
      )
      .populate('workspaceId', 'name key type')
      .exec();

    const myTasks = await this.taskModel
      .find({ assigneeId: userObjectId })
      .select('title key columnId type priority workspaceId createdAt updatedAt')
      .populate('workspaceId', 'name key type')
      .exec();

    return {
      tasksAssigned,
      tasksByStatus,
      tasksByPriority,
      recentlyCompleted,
      recentActivity,
      myTasks,
    };
  }

  async getSprintProgress(sprintId: string) {
    this.logger.log(`Getting sprint progress for sprintId: ${sprintId}`);

    const sprintObjectId = new Types.ObjectId(sprintId);
    const sprint = await this.sprintModel.findById(sprintObjectId);

    if (!sprint) {
      return null;
    }

    const tasks = await this.taskModel
      .find({ sprintId: sprintObjectId })
      .select('title key columnId type priority storyPoints assigneeId')
      .populate('assigneeId', 'name email avatarUrl')
      .exec();

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.columnId === 'done').length;
    const totalStoryPoints = tasks.reduce(
      (sum, task) => sum + (task.storyPoints || 0),
      0,
    );
    const completedStoryPoints = tasks
      .filter(task => task.columnId === 'done')
      .reduce((sum, task) => sum + (task.storyPoints || 0), 0);

    const tasksByStatus = await this.taskModel.aggregate([
      { $match: { sprintId: sprintObjectId } },
      { $group: { _id: '$columnId', count: { $sum: 1 } } },
    ]);

    return {
      sprint: {
        _id: sprint._id,
        name: `Sprint ${sprint._id.toString().substring(sprint._id.toString().length - 4)}`,
        status: sprint.status,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      },
      totalTasks,
      completedTasks,
      totalStoryPoints,
      completedStoryPoints,
      completionPercentage:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      storyPointsCompletionPercentage:
        totalStoryPoints > 0
          ? Math.round((completedStoryPoints / totalStoryPoints) * 100)
          : 0,
      tasksByStatus,
      tasks: tasks.map(task => ({
        _id: task._id,
        title: task.title,
        key: task.key,
        status: task.columnId,
        type: task.type,
        priority: task.priority,
        storyPoints: task.storyPoints,
        assignee: task.assigneeId,
      })),
    };
  }
}
