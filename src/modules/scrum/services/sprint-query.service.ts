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

@Injectable()
export class SprintQueryService {
  constructor(
    private readonly boardStatusService: BoardStatusService,
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
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

  private validateObjectId(id: string, resourceName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(ErrorFactory.invalidIdFormat(resourceName));
    }
  }
}
