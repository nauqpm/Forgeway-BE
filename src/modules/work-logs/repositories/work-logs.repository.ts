import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
}
