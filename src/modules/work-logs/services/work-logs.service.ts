import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CreateWorkLogDto } from '../dtos/requests/create-work-log.dto';
import { WorkLogListDto } from '../dtos/responses/work-log.dto';
import { WorklogReportDto } from '../dtos/responses/worklog-report.dto';
import { WorklogReportQueryDto } from '../dtos/requests/worklog-report-query.dto';
import { WorkLogMapper } from '../mappers/work-log.mapper';
import { WorkLogsRepository } from '../repositories/work-logs.repository';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import {
  Workspace,
  WorkspaceDocument,
} from '../../workspaces/schemas/workspace.schema';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

@Injectable()
export class WorkLogsService {
  constructor(
    private readonly workLogsRepository: WorkLogsRepository,
    private readonly workLogMapper: WorkLogMapper,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    private readonly taskActivitiesService: TaskActivitiesService,
  ) {}

  async create(
    workspaceId: string,
    taskId: string,
    userId: string,
    dto: CreateWorkLogDto,
  ) {
    const task = await this.taskModel.findOne({
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isDeleted: { $ne: true },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const workLog = await this.workLogsRepository.create(
      workspaceId,
      taskId,
      task.key,
      userId,
      dto,
    );

    const totalHours = await this.workLogsRepository.sumHoursForTask(taskId);

    // Update task's timeLogged and optionally timeEstimated
    const updateData: any = { timeLogged: totalHours };
    if (dto.timeEstimated !== undefined) {
      updateData.timeEstimated = dto.timeEstimated;
    }

    const updatedTask = await this.taskModel.findOneAndUpdate(
      { _id: task._id },
      { $set: updateData },
      { new: true },
    );

    // Record activity
    await this.taskActivitiesService.recordWorkLogged(
      updatedTask,
      userId,
      dto.hoursSpent || 0,
      dto.timeEstimated,
    );

    return this.workLogMapper.mapToDto(workLog);
  }

  async getByTaskId(
    workspaceId: string,
    taskId: string,
  ): Promise<WorkLogListDto> {
    const task = await this.taskModel.findOne({
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isDeleted: { $ne: true },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const logs = await this.workLogsRepository.findByTaskId(taskId);
    const totalHours = logs.reduce((sum, log) => sum + log.hoursSpent, 0);

    return {
      workLogs: this.workLogMapper.mapToDtos(logs),
      total: logs.length,
      totalHours,
    };
  }

  async update(
    workspaceId: string,
    taskId: string,
    logId: string,
    userId: string,
    dto: import('../dtos/requests/update-work-log.dto').UpdateWorkLogDto,
  ) {
    const workLog = await this.workLogsRepository.findById(workspaceId, logId);
    if (!workLog) {
      throw new NotFoundException(`Work log with ID ${logId} not found`);
    }

    // Check permissions if needed (e.g., only the creator can edit)
    // For now, we just proceed.
    const updateData: any = {};
    if (dto.hoursSpent !== undefined) updateData.hoursSpent = dto.hoursSpent;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.loggedAt !== undefined)
      updateData.loggedAt = new Date(dto.loggedAt);

    const updatedLog = await this.workLogsRepository.update(logId, updateData);

    // recalculate sum and update task
    const totalHours = await this.workLogsRepository.sumHoursForTask(taskId);

    const taskUpdateData: any = { timeLogged: totalHours };
    if (dto.timeEstimated !== undefined) {
      taskUpdateData.timeEstimated = dto.timeEstimated;
    }

    await this.taskModel.findOneAndUpdate(
      { _id: new Types.ObjectId(taskId) },
      { $set: taskUpdateData },
      { new: true },
    );

    return this.workLogMapper.mapToDto(updatedLog as any);
  }

  async delete(
    workspaceId: string,
    taskId: string,
    logId: string,
    userId: string,
    adjustTimeRemaining: boolean = false,
    newTimeEstimated?: string,
  ) {
    const workLog = await this.workLogsRepository.findById(workspaceId, logId);
    if (!workLog) {
      throw new NotFoundException(`Work log with ID ${logId} not found`);
    }

    await this.workLogsRepository.delete(logId);

    // recalculate sum and update task
    const totalHours = await this.workLogsRepository.sumHoursForTask(taskId);

    const taskUpdateData: any = { timeLogged: totalHours };
    if (adjustTimeRemaining && newTimeEstimated !== undefined) {
      taskUpdateData.timeEstimated = newTimeEstimated;
    }

    await this.taskModel.findOneAndUpdate(
      { _id: new Types.ObjectId(taskId) },
      { $set: taskUpdateData },
      { new: true },
    );
  }

  async getReport(
    workspaceId: string,
    userId: string,
    query: WorklogReportQueryDto,
  ): Promise<WorklogReportDto> {
    // Determine timezone offset (default +7)
    const tzOffset = query.timezoneOffset ?? 7;

    // Default: last 30 days
    const now = new Date();
    const endDate = query.endDate
      ? new Date(new Date(query.endDate).getTime() + 86400000 - 1) // inclusive end
      : now;
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const groupBy = query.groupBy ?? 'week';

    // Check if user is admin in this workspace
    const workspace = await this.workspaceModel.findById(
      new Types.ObjectId(workspaceId),
    );
    const memberEntry = workspace?.members?.find(
      m => m.userId.toString() === userId,
    );
    const isAdmin = memberEntry?.role === SPACE_ROLES.WORKSPACE_ADMIN;

    // If not admin, force filter to own userId only
    let filterUserIds = query.userIds;
    if (!isAdmin) {
      filterUserIds = [userId];
    }

    const rawLogs = await this.workLogsRepository.findForReport(
      workspaceId,
      startDate,
      endDate,
      filterUserIds,
      query.taskKey,
    );

    // Build period labels
    const periods = this.buildPeriods(startDate, endDate, groupBy, tzOffset);

    // Group logs by user then task
    const userMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        avatarUrl?: string;
        tasks: Map<
          string,
          {
            taskId: string;
            taskKey: string;
            taskTitle: string;
            taskType?: string;
            periodHours: Record<string, number>;
          }
        >;
      }
    >();

    for (const log of rawLogs) {
      const uid = log.loggedBy.toString();
      const tid = log.taskId.toString();
      const periodLabel = this.getPeriodLabel(
        new Date(log.loggedAt),
        groupBy,
        tzOffset,
      );

      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          userName: log.user?.fullName || log.user?.email || 'Unknown',
          avatarUrl: log.user?.avatarUrl || log.user?.avatar,
          tasks: new Map(),
        });
      }

      const userEntry = userMap.get(uid)!;
      if (!userEntry.tasks.has(tid)) {
        userEntry.tasks.set(tid, {
          taskId: tid,
          taskKey: log.taskKey,
          taskTitle: log.task?.title || log.taskKey,
          taskType: log.task?.type,
          periodHours: {},
        });
      }

      const taskEntry = userEntry.tasks.get(tid)!;
      taskEntry.periodHours[periodLabel] =
        (taskEntry.periodHours[periodLabel] || 0) + log.hoursSpent;
    }

    // Build response
    let grandTotalHours = 0;
    const users = Array.from(userMap.values()).map(u => {
      const tasks = Array.from(u.tasks.values()).map(t => {
        const totalHours = Object.values(t.periodHours).reduce(
          (s, h) => s + h,
          0,
        );
        return { ...t, totalHours };
      });
      const userTotal = tasks.reduce((s, t) => s + t.totalHours, 0);
      grandTotalHours += userTotal;
      return {
        userId: u.userId,
        userName: u.userName,
        avatarUrl: u.avatarUrl,
        totalHours: userTotal,
        tasks,
      };
    });

    return { periods, users, grandTotalHours };
  }

  private buildPeriods(
    start: Date,
    end: Date,
    groupBy: 'week' | 'month' | 'day',
    tzOffset: number,
  ): string[] {
    const periods: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const label = this.getPeriodLabel(cur, groupBy, tzOffset);
      if (!periods.includes(label)) periods.push(label);
      // Advance by 1 day and re-label
      cur.setDate(cur.getDate() + 1);
    }
    return periods;
  }

  private getPeriodLabel(
    date: Date,
    groupBy: 'week' | 'month' | 'day',
    tzOffset: number,
  ): string {
    // Shift to local timezone
    const local = new Date(date.getTime() + tzOffset * 3600 * 1000);
    if (groupBy === 'day') {
      return local.toISOString().slice(0, 10); // e.g. "2024-07-06"
    }
    if (groupBy === 'month') {
      return local.toISOString().slice(0, 7); // e.g. "2024-07"
    }
    // Week: ISO week number
    const d = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `W${weekNo} ${d.getUTCFullYear()}`;
  }
}
