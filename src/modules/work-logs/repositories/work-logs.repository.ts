import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { WorkLog, WorkLogDocument } from '../schemas/work-log.schema';
import { CreateWorkLogDto } from '../dtos/requests/create-work-log.dto';

@Injectable()
export class WorkLogsRepository {
  constructor(
    @InjectModel(WorkLog.name)
    private readonly workLogModel: Model<WorkLogDocument>,
  ) {}

  async create(
    workspaceId: string,
    taskId: string,
    taskKey: string,
    loggedBy: string,
    dto: CreateWorkLogDto,
  ): Promise<WorkLogDocument> {
    const workLog = new this.workLogModel({
      workspaceId: new Types.ObjectId(workspaceId),
      taskId: new Types.ObjectId(taskId),
      taskKey,
      loggedBy: new Types.ObjectId(loggedBy),
      hoursSpent: dto.hoursSpent,
      description: dto.description,
      loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : new Date(),
    });

    return workLog.save();
  }

  async findByTaskId(taskId: string): Promise<WorkLogDocument[]> {
    return this.workLogModel
      .find({ taskId: new Types.ObjectId(taskId) })
      .sort({ loggedAt: -1 })
      .exec();
  }

  async findById(
    workspaceId: string,
    id: string,
  ): Promise<WorkLogDocument | null> {
    return this.workLogModel
      .findOne({
        _id: new Types.ObjectId(id),
        workspaceId: new Types.ObjectId(workspaceId),
      })
      .exec();
  }

  async findByIdForTask(
    workspaceId: string,
    taskId: string,
    id: string,
  ): Promise<WorkLogDocument | null> {
    return this.workLogModel
      .findOne({
        _id: new Types.ObjectId(id),
        workspaceId: new Types.ObjectId(workspaceId),
        taskId: new Types.ObjectId(taskId),
      })
      .exec();
  }

  async update(
    id: string,
    data: Partial<WorkLog>,
  ): Promise<WorkLogDocument | null> {
    return this.workLogModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $set: data },
        { new: true },
      )
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.workLogModel.deleteOne({ _id: new Types.ObjectId(id) }).exec();
  }

  async sumHoursForTask(taskId: string): Promise<number> {
    const result = await this.workLogModel.aggregate([
      { $match: { taskId: new Types.ObjectId(taskId) } },
      { $group: { _id: null, total: { $sum: '$hoursSpent' } } },
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Aggregate worklogs for report: returns raw docs with task + user lookup.
   */
  async findForReport(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    userIds?: string[],
    taskKey?: string,
  ): Promise<any[]> {
    const matchStage: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      loggedAt: { $gte: startDate, $lte: endDate },
    };

    if (userIds && userIds.length > 0) {
      matchStage.loggedBy = { $in: userIds.map(id => new Types.ObjectId(id)) };
    }

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      // Lookup task info
      {
        $lookup: {
          from: 'tasks',
          localField: 'taskId',
          foreignField: '_id',
          as: 'task',
        },
      },
      { $unwind: { path: '$task', preserveNullAndEmptyArrays: false } },
    ];

    if (taskKey) {
      pipeline.push({
        $match: {
          $or: [
            { taskKey: { $regex: taskKey, $options: 'i' } },
            { 'task.title': { $regex: taskKey, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      // Lookup user info
      {
        $lookup: {
          from: 'users',
          localField: 'loggedBy',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 1,
          hoursSpent: 1,
          loggedAt: 1,
          taskId: 1,
          taskKey: 1,
          loggedBy: 1,
          'task.title': 1,
          'task.type': 1,
          'user.fullName': 1,
          'user.email': 1,
          'user.avatarUrl': 1,
          'user.avatar': 1,
        },
      },
    );

    return this.workLogModel.aggregate(pipeline).exec();
  }
}
