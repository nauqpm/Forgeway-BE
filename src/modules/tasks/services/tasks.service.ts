import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { Task, TaskDocument, TaskAttachment } from '../schemas/task.schema';
import { CreateTaskDto, UpdateTaskDto, FilterTaskDto } from '../dtos/create-task.dto';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    private workspacesService: WorkspacesService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskDocument> {
    let workspaceId = createTaskDto.workspaceId;
    if (!workspaceId) {
      const workspaces = await this.workspacesService.findByUserId(userId);
      if (workspaces.length === 0) {
        throw new NotFoundException('No workspace found. Please create a workspace first.');
      }
      workspaceId = workspaces[0]._id.toString();
    }
    if (!workspaceId) {
      throw new NotFoundException('Workspace is required to create a task.');
    }

    const key = await this.getNextKey(workspaceId);

    const task = new this.taskModel({
      ...createTaskDto,
      workspaceId: new Types.ObjectId(workspaceId),
      reporterId: new Types.ObjectId(userId),
      key,
      status: createTaskDto.status || 'todo',
      priority: createTaskDto.priority || 'medium',
      type: createTaskDto.type || 'task',
      labels: createTaskDto.labels || [],
      attachments: [],
    });

    const savedTask = await task.save();
    this.logger.log(`Task created: ${key} by user ${userId}`);
    return savedTask;
  }

  async findById(id: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const task = await this.taskModel
      .findById(id)
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'startDate endDate')
      .populate('boardId')
      .populate('parentId', 'key title')
      .populate('epicId', 'key title')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async findByKey(key: string): Promise<TaskDocument> {
    const task = await this.taskModel
      .findOne({ key })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'startDate endDate')
      .populate('boardId')
      .populate('parentId', 'key title')
      .populate('epicId', 'key title')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with key ${key} not found`);
    }

    return task;
  }

  async findAll(filterDto: FilterTaskDto): Promise<{ tasks: TaskDocument[]; total: number; page: number; limit: number }> {
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
    if (filterDto.boardColumnId) {
      filter.boardColumnId = filterDto.boardColumnId;
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
      filter.status = filterDto.status;
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

    const page = filterDto.page || 1;
    const limit = filterDto.limit || 20;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      this.taskModel
        .find(filter)
        .populate('workspaceId', 'key name')
        .populate('assigneeId', 'name email avatar')
        .populate('reporterId', 'name email avatar')
        .populate('sprintId', 'startDate endDate')
        .populate('boardId')
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
    return this.taskModel
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findBySprint(sprintId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ sprintId: new Types.ObjectId(sprintId) })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByBoard(boardId: string): Promise<Record<string, TaskDocument[]>> {
    const tasks = await this.taskModel
      .find({ boardId: new Types.ObjectId(boardId) })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();

    const groupedByColumn: Record<string, TaskDocument[]> = {};
    for (const task of tasks) {
      const columnId = task.boardColumnId || 'none';
      if (!groupedByColumn[columnId]) {
        groupedByColumn[columnId] = [];
      }
      groupedByColumn[columnId].push(task);
    }

    return groupedByColumn;
  }

  async findByAssignee(userId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ assigneeId: new Types.ObjectId(userId) })
      .populate('workspaceId', 'key name')
      .populate('sprintId', 'startDate endDate').populate('boardId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const updateData: Record<string, any> = { ...updateTaskDto };

    if (updateTaskDto.assigneeId) {
      updateData.assigneeId = new Types.ObjectId(updateTaskDto.assigneeId);
    }
    if (updateTaskDto.sprintId) {
      updateData.sprintId = new Types.ObjectId(updateTaskDto.sprintId);
    }
    if (updateTaskDto.boardId) {
      updateData.boardId = new Types.ObjectId(updateTaskDto.boardId);
    }
    if (updateTaskDto.parentId) {
      updateData.parentId = new Types.ObjectId(updateTaskDto.parentId);
    }
    if (updateTaskDto.epicId) {
      updateData.epicId = new Types.ObjectId(updateTaskDto.epicId);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .populate('sprintId', 'startDate endDate').populate('boardId')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    this.logger.log(`Task updated: ${task.key}`);
    return task;
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const result = await this.taskModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    this.logger.log(`Task deleted: ${id}`);
  }

  async moveToBoard(taskId: string, boardId: string, columnId: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          boardId: new Types.ObjectId(boardId),
          boardColumnId: columnId,
        },
        { new: true },
      )
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Task ${task.key} moved to board ${boardId}, column ${columnId}`);
    return task;
  }

  async assignTo(taskId: string, userId: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { assigneeId: new Types.ObjectId(userId) },
        { new: true },
      )
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .populate('reporterId', 'name email avatar')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Task ${task.key} assigned to user ${userId}`);
    return task;
  }

  async changeStatus(taskId: string, status: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(taskId, { status }, { new: true })
      .populate('workspaceId', 'key name')
      .populate('assigneeId', 'name email avatar')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Task ${task.key} status changed to ${status}`);
    return task;
  }

  async addLabel(taskId: string, label: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { $addToSet: { labels: label } },
        { new: true },
      )
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Label "${label}" added to task ${task.key}`);
    return task;
  }

  async removeLabel(taskId: string, label: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { $pull: { labels: label } },
        { new: true },
      )
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Label "${label}" removed from task ${task.key}`);
    return task;
  }

  async addAttachment(taskId: string, attachment: Partial<TaskAttachment>): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const attachmentWithId = {
      ...attachment,
      id: attachment.id || new Types.ObjectId().toString(),
      uploadedAt: new Date(),
    };

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { $push: { attachments: attachmentWithId } },
        { new: true },
      )
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Attachment "${attachment.name}" added to task ${task.key}`);
    return task;
  }

  async removeAttachment(taskId: string, attachmentId: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { $pull: { attachments: { id: attachmentId } } },
        { new: true },
      )
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Attachment ${attachmentId} removed from task ${task.key}`);
    return task;
  }

  async getNextKey(workspaceId: string): Promise<string> {
    const workspace = await this.workspacesService.findById(workspaceId);
    const workspaceKey = workspace.key;

    const count = await this.taskModel.countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
    const nextNumber = count + 1;

    return `${workspaceKey}-${nextNumber}`;
  }
}
