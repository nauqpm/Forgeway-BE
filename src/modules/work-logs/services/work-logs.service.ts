import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CreateWorkLogDto } from '../dtos/requests/create-work-log.dto';
import { WorkLogMapper } from '../mappers/work-log.mapper';
import { WorkLogsRepository } from '../repositories/work-logs.repository';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';

@Injectable()
export class WorkLogsService {
  constructor(
    private readonly workLogsRepository: WorkLogsRepository,
    private readonly workLogMapper: WorkLogMapper,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly taskActivitiesService: TaskActivitiesService,
  ) {}

  async create(
    workspaceId: string,
    taskId: string,
    userId: string,
    dto: CreateWorkLogDto,
  ) {
    if (
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      throw new NotFoundException(`Task not found`);
    }

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

  async update(
    workspaceId: string,
    taskId: string,
    logId: string,
    userId: string,
    dto: import('../dtos/requests/update-work-log.dto').UpdateWorkLogDto,
  ) {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(logId)
    ) {
      throw new NotFoundException(`Work log not found`);
    }

    const workLog = await this.workLogsRepository.findByIdForTask(
      workspaceId,
      taskId,
      logId,
    );
    if (!workLog) {
      throw new NotFoundException(
        `Work log with ID ${logId} not found for this task`,
      );
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
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(logId)
    ) {
      throw new NotFoundException(`Work log not found`);
    }

    const workLog = await this.workLogsRepository.findByIdForTask(
      workspaceId,
      taskId,
      logId,
    );
    if (!workLog) {
      throw new NotFoundException(
        `Work log with ID ${logId} not found for this task`,
      );
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
}
