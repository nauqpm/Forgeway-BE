import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Task, TaskAttachment, TaskDocument } from '../schemas/task.schema';
import { FilterTaskDto } from '../dtos/requests/create-task.dto';

@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async create(data: Partial<Task>): Promise<TaskDocument> {
    const task = new this.taskModel(data);
    return task.save();
  }

  async findById(id: string): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.taskModel
      .findById(id)
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'name startDate endDate')
      .populate('boardId', 'name')
      .populate('parentId', 'key title')
      .populate('epicId', 'key title')
      .exec();
  }

  async findByKey(key: string): Promise<TaskDocument | null> {
    return this.taskModel
      .findOne({ key })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'name startDate endDate')
      .populate('boardId', 'name')
      .populate('parentId', 'key title')
      .populate('epicId', 'key title')
      .exec();
  }

  async findAll(filterDto: FilterTaskDto): Promise<{
    tasks: TaskDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter = this.buildFilter(filterDto);
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 20;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      this.taskModel
        .find(filter)
        .populate('workspaceId', 'key name')
        .populate('assigneeId', 'name email avatar')
        .populate('reporterId', 'name email avatar')
        .populate('sprintId', 'name')
        .populate('boardId', 'name')
        .populate('epicId', 'key title')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.taskModel.countDocuments(filter).exec(),
    ]);

    return { tasks, total, page, limit };
  }

  async findByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return [];
    }

    return this.taskModel
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findBySprint(sprintId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(sprintId)) {
      return [];
    }

    return this.taskModel
      .find({ sprintId: new Types.ObjectId(sprintId) })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByBoard(boardId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(boardId)) {
      return [];
    }

    return this.taskModel
      .find({ boardId: new Types.ObjectId(boardId) })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByAssignee(userId: string): Promise<TaskDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    return this.taskModel
      .find({ assigneeId: new Types.ObjectId(userId) })
      .populate('workspaceId', 'key name')
      .populate('sprintId', 'name')
      .populate('boardId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      return 0;
    }

    return this.taskModel
      .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
  }

  async update(id: string, data: Partial<Task>): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.taskModel
      .findByIdAndUpdate(id, data, { new: true })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'name')
      .populate('boardId', 'name')
      .populate('parentId', 'key title')
      .populate('epicId', 'key title')
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await this.taskModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async addLabel(id: string, label: string): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.taskModel
      .findByIdAndUpdate(id, { $addToSet: { labels: label } }, { new: true })
      .exec();
  }

  async removeLabel(id: string, label: string): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.taskModel
      .findByIdAndUpdate(id, { $pull: { labels: label } }, { new: true })
      .exec();
  }

  async addAttachment(
    id: string,
    attachment: Partial<TaskAttachment>,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const attachmentWithId = {
      ...attachment,
      id: attachment.id || new Types.ObjectId().toString(),
      uploadedAt: new Date(),
    };

    return this.taskModel
      .findByIdAndUpdate(
        id,
        { $push: { attachments: attachmentWithId } },
        { new: true },
      )
      .exec();
  }

  async removeAttachment(
    id: string,
    attachmentId: string,
  ): Promise<TaskDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.taskModel
      .findByIdAndUpdate(
        id,
        { $pull: { attachments: { id: attachmentId } } },
        { new: true },
      )
      .exec();
  }

  private buildFilter(filterDto: FilterTaskDto): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {};

    if (filterDto.workspaceId) {
      filter.workspaceId = new Types.ObjectId(filterDto.workspaceId);
    }
    if (filterDto.sprintId) {
      filter.sprintId = new Types.ObjectId(filterDto.sprintId);
    }
    if (filterDto.boardId) {
      filter.boardId = new Types.ObjectId(filterDto.boardId);
    }
    if (filterDto.columnId || filterDto.boardColumnId) {
      filter.columnId = filterDto.columnId || filterDto.boardColumnId;
    }
    if (filterDto.assigneeId) {
      filter.assigneeId = new Types.ObjectId(filterDto.assigneeId);
    }
    if (filterDto.reporterId) {
      filter.reporterId = new Types.ObjectId(filterDto.reporterId);
    }
    if (filterDto.type) {
      filter.type = filterDto.type;
    }
    if (filterDto.status) {
      filter.columnId = filterDto.status;
    }
    if (filterDto.priority) {
      filter.priority = filterDto.priority;
    }
    if (filterDto.epicId) {
      filter.epicId = new Types.ObjectId(filterDto.epicId);
    }
    if (filterDto.labels && filterDto.labels.length > 0) {
      filter.labels = { $in: filterDto.labels };
    }
    if (filterDto.search) {
      filter.$text = { $search: filterDto.search };
    }

    return filter;
  }
}
