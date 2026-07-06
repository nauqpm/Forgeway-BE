//Xử lý các thao tác đọc dữ liệu sprint:
// - lấy danh sách sprint theo workspace
// - lấy active sprint
// - lấy task trong sprint
// - lấy preview khi complete sprint
// - tìm sprint theo id
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { sortTasksByPriority } from '../utils/task-priority-sorter.util';
import { BoardStatusService } from './board-status.service';
import { ErrorFactory } from '../../../common/factories/error.factory';
import {
  TaskActivity,
  TaskActivityDocument,
} from '../../task-activities/schemas/task-activity.schema';
import { Board, BoardDocument } from '../../kanban/schemas/kanban-board.schema';

@Injectable()
export class SprintQueryService {
  constructor(
    private readonly boardStatusService: BoardStatusService,
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(TaskActivity.name)
    private readonly taskActivityModel: Model<TaskActivityDocument>,
    @InjectModel(Board.name) private readonly boardModel: Model<BoardDocument>,
  ) {}

  async findByWorkspace(workspaceId: string): Promise<SprintDocument[]> {
    return this.sprintModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getActiveSprint(workspaceId: string): Promise<any | null> {
    const sprint = await this.sprintModel
      .findOne({
        workspaceId: new Types.ObjectId(workspaceId),
        status: 'active',
        deletedAt: null,
      })
      .exec();

    if (!sprint) {
      return null;
    }

    const tasks = await this.getSprintTasks(workspaceId, sprint._id.toString());
    const sprintObj = sprint.toObject();

    return {
      ...sprintObj,
      tasks,
    };
  }

  async getSprintTasks(
    workspaceId: string,
    sprintId: string,
  ): Promise<TaskDocument[]> {
    const tasks = await this.taskModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        sprintId: new Types.ObjectId(sprintId),
        isDeleted: { $ne: true },
      })
      .exec();

    return sortTasksByPriority(tasks);
  }

  async getCompleteSprintPreview(
    workspaceId: string,
    sprintId: string,
  ): Promise<any> {
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const sprintObjectId = new Types.ObjectId(sprintId);

    const sprint = await this.sprintModel
      .findOne({
        _id: sprintObjectId,
        workspaceId: workspaceObjectId,
        deletedAt: null,
      })
      .lean()
      .exec();

    if (!sprint) {
      throw new NotFoundException(ErrorFactory.sprintNotFound(sprintId));
    }

    if (sprint.status !== 'active') {
      throw new BadRequestException(
        ErrorFactory.sprintInvalidStatus('active', sprint.status),
      );
    }

    const completedStatuses =
      await this.boardStatusService.getCompletedStatuses(workspaceObjectId);

    const tasks = await this.taskModel
      .find({
        workspaceId: workspaceObjectId,
        sprintId: sprintObjectId,
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();

    const incompleteTasks = sortTasksByPriority(
      tasks.filter(task => !completedStatuses.includes(task.status)),
    );

    return {
      sprintId: sprint._id,
      sprintName: sprint.name,
      totalTasks: tasks.length,
      completedTasks: tasks.length - incompleteTasks.length,
      incompleteTasks: incompleteTasks.length,
      incompleteTaskList: incompleteTasks,
    };
  }

  async findSprintById(sprintId: string): Promise<SprintDocument | null> {
    return this.sprintModel
      .findOne({
        _id: new Types.ObjectId(sprintId),
        deletedAt: null,
      })
      .exec();
  }

  async findByIdInWorkspace(
    workspaceId: string,
    sprintId: string,
  ): Promise<SprintDocument> {
    this.validateObjectId(workspaceId, 'Workspace');
    this.validateObjectId(sprintId, 'Sprint');

    const sprint = await this.sprintModel
      .findOne({
        _id: new Types.ObjectId(sprintId),
        workspaceId: new Types.ObjectId(workspaceId),
        deletedAt: null,
      })
      .exec();

    if (!sprint) {
      throw new NotFoundException(ErrorFactory.sprintNotFound(sprintId));
    }

    return sprint;
  }

  async getSprintVelocityReport(workspaceId: string): Promise<any[]> {
    this.validateObjectId(workspaceId, 'Workspace');
    const workspaceObjectId = new Types.ObjectId(workspaceId);

    const sprints = await this.sprintModel
      .find({
        workspaceId: workspaceObjectId,
        status: 'completed',
        deletedAt: null,
      })
      .sort({ completedAt: 1 })
      .limit(10)
      .lean()
      .exec();

    if (sprints.length === 0) {
      return [];
    }

    const sprintIds = sprints.map(s => s._id);
    const completedStatuses =
      await this.boardStatusService.getCompletedStatuses(workspaceObjectId);

    const taskStats = await this.taskModel.aggregate([
      {
        $match: {
          workspaceId: workspaceObjectId,
          sprintId: { $in: sprintIds },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$sprintId',
          totalStoryPoints: { $sum: { $ifNull: ['$storyPoints', 0] } },
          totalTasksCount: { $sum: 1 },
          completedStoryPoints: {
            $sum: {
              $cond: [
                { $in: ['$status', completedStatuses] },
                { $ifNull: ['$storyPoints', 0] },
                0,
              ],
            },
          },
          completedTasksCount: {
            $sum: {
              $cond: [{ $in: ['$status', completedStatuses] }, 1, 0],
            },
          },
          tasksWithSpCount: {
            $sum: {
              $cond: [{ $isNumber: '$storyPoints' }, 1, 0],
            },
          },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    taskStats.forEach(stat => {
      statsMap.set(stat._id.toString(), stat);
    });

    return sprints.map(sprint => {
      const sprintIdStr = sprint._id.toString();
      const stat = statsMap.get(sprintIdStr) || {
        totalStoryPoints: 0,
        totalTasksCount: 0,
        completedStoryPoints: 0,
        completedTasksCount: 0,
        tasksWithSpCount: 0,
      };

      const committedStoryPoints =
        sprint.committedStoryPoints ?? stat.totalStoryPoints;
      const committedTasksCount =
        sprint.committedTasksCount ?? stat.totalTasksCount;
      const completedStoryPoints = stat.completedStoryPoints;
      const completedTasksCount = stat.completedTasksCount;

      const hasLowStoryPointsCoverage =
        committedTasksCount > 0
          ? stat.tasksWithSpCount / committedTasksCount < 0.5
          : true;

      return {
        sprintId: sprintIdStr,
        sprintName: sprint.name,
        committedStoryPoints,
        completedStoryPoints,
        committedTasksCount,
        completedTasksCount,
        hasLowStoryPointsCoverage,
        completedAt: sprint.completedAt,
      };
    });
  }

  async getCumulativeFlowReport(
    workspaceId: string,
    days = 30,
    timezoneOffset = 7,
  ): Promise<{ statuses: string[]; data: any[] }> {
    this.validateObjectId(workspaceId, 'Workspace');
    const workspaceObjectId = new Types.ObjectId(workspaceId);

    const board = await this.boardModel
      .findOne({ workspaceId: workspaceObjectId })
      .lean()
      .exec();

    const columns = board?.columns || [];
    columns.sort((a, b) => a.order - b.order);

    const statuses = columns.map(col => col.name);

    if (statuses.length === 0) {
      statuses.push('todo', 'inprogress', 'done');
    }

    const tasks = await this.taskModel
      .find({
        workspaceId: workspaceObjectId,
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();

    const taskIds = tasks.map(t => t._id);

    const activities = await this.taskActivityModel
      .find({
        workspaceId: workspaceObjectId,
        taskId: { $in: taskIds },
        type: {
          $in: [
            'COLUMN_CHANGED',
            'TASK_CREATED',
            'TASK_ARCHIVED',
            'TASK_RESTORED',
          ],
        },
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    const taskActivitiesMap = new Map<string, any[]>();
    activities.forEach(act => {
      const tId = act.taskId.toString();
      if (!taskActivitiesMap.has(tId)) {
        taskActivitiesMap.set(tId, []);
      }
      taskActivitiesMap.get(tId)!.push(act);
    });

    const resolveColumnId = (cId?: string, status?: string): string => {
      if (cId) {
        const col = columns.find(c => c.id === cId);
        if (col) return col.id;
      }
      if (status) {
        const col = columns.find(c =>
          c.mappedStatuses?.some(s => s.toLowerCase() === status.toLowerCase()),
        );
        if (col) return col.id;
      }
      return columns[0]?.id || '';
    };

    const taskEventsMap = new Map<
      string,
      { time: number; columnId: string }[]
    >();
    tasks.forEach(task => {
      const tId = task._id.toString();
      const taskActs = taskActivitiesMap.get(tId) || [];

      const firstColChange = taskActs.find(a => a.type === 'COLUMN_CHANGED');
      const initialColumnId = firstColChange
        ? String(firstColChange.metadata?.from || '')
        : resolveColumnId(task.columnId, task.status);

      const events: { time: number; columnId: string }[] = [];

      events.push({
        time: new Date(task.createdAt).getTime(),
        columnId: initialColumnId,
      });

      taskActs.forEach((act, idx) => {
        const time = new Date(act.createdAt).getTime();
        if (act.type === 'COLUMN_CHANGED') {
          const toCol = String(act.metadata?.to || '');
          if (toCol) {
            events.push({ time, columnId: toCol });
          }
        } else if (act.type === 'TASK_ARCHIVED') {
          events.push({ time, columnId: 'archived' });
        } else if (act.type === 'TASK_RESTORED') {
          const nextChange = taskActs
            .slice(idx + 1)
            .find(a => a.type === 'COLUMN_CHANGED');
          const restoredCol = nextChange
            ? String(nextChange.metadata?.from || '')
            : resolveColumnId(task.columnId, task.status);
          events.push({ time, columnId: restoredCol });
        }
      });

      events.sort((a, b) => a.time - b.time);
      taskEventsMap.set(tId, events);
    });

    const targetDays: { time: number; label: string }[] = [];
    const now = new Date();
    const nowLocal = new Date(now.getTime() + timezoneOffset * 3600 * 1000);

    for (let i = days - 1; i >= 0; i--) {
      const targetLocal = new Date(nowLocal);
      targetLocal.setDate(nowLocal.getDate() - i);
      targetLocal.setUTCHours(23, 59, 59, 999);

      const targetUtcTime =
        targetLocal.getTime() - timezoneOffset * 3600 * 1000;

      const labelDate = new Date(targetUtcTime + timezoneOffset * 3600 * 1000);
      const dateLabel = labelDate.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        timeZone: 'UTC',
      });

      targetDays.push({
        time: targetUtcTime,
        label: dateLabel,
      });
    }

    const taskPointers = new Map<string, number>();
    tasks.forEach(task => {
      taskPointers.set(task._id.toString(), -1);
    });

    const dataPoints: any[] = [];

    targetDays.forEach(day => {
      const counts: Record<string, number> = {};
      statuses.forEach(s => {
        counts[s] = 0;
      });

      tasks.forEach(task => {
        const tId = task._id.toString();
        const events = taskEventsMap.get(tId) || [];
        let ptr = taskPointers.get(tId) ?? -1;

        while (ptr + 1 < events.length && events[ptr + 1].time <= day.time) {
          ptr++;
        }
        taskPointers.set(tId, ptr);

        if (ptr === -1) {
          return;
        }

        const currentColumnId = events[ptr].columnId;

        if (currentColumnId === 'archived') {
          return;
        }

        const matchedCol = columns.find(c => c.id === currentColumnId);

        if (matchedCol) {
          counts[matchedCol.name] = (counts[matchedCol.name] || 0) + 1;
        } else {
          const fallbackColName = statuses[0];
          counts[fallbackColName] = (counts[fallbackColName] || 0) + 1;
        }
      });

      dataPoints.push({
        date: day.label,
        ...counts,
      });
    });

    return {
      statuses,
      data: dataPoints,
    };
  }

  private validateObjectId(id: string, resourceName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(ErrorFactory.invalidIdFormat(resourceName));
    }
  }
}
