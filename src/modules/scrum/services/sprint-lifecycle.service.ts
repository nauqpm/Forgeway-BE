// Xử lý vòng đời sprint: start sprint và complete sprint.
// File này kiểm tra trạng thái sprint, kiểm tra active sprint hiện tại,
// validate target sprint khi đóng sprint, move incomplete tasks.
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CompleteSprintDto, StartSprintDto } from '../dtos/sprint.dto';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { BoardStatusService } from './board-status.service';
import { ErrorFactory } from '../../../common/factories/error.factory';

@Injectable()
export class SprintLifecycleService {
  private readonly logger = new Logger(SprintLifecycleService.name);

  constructor(
    private readonly boardStatusService: BoardStatusService,
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async startSprint(
    workspaceId: string,
    sprintId: string,
    dto: StartSprintDto,
  ): Promise<SprintDocument> {
    this.logger.log(
      `Bắt đầu một sprint: ${sprintId} cho workspace: ${workspaceId}`,
    );

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const sprintObjectId = new Types.ObjectId(sprintId);

    const sprint = await this.sprintModel
      .findOne({
        _id: sprintObjectId,
        workspaceId: workspaceObjectId,
        deletedAt: null,
      })
      .exec();

    if (!sprint) {
      throw new NotFoundException(ErrorFactory.sprintNotFound(sprintId));
    }

    if (sprint.status !== 'planning') {
      throw new BadRequestException(
        ErrorFactory.sprintInvalidStatus('planning', sprint.status),
      );
    }

    const activeSprint = await this.sprintModel
      .findOne({
        workspaceId: workspaceObjectId,
        status: 'active',
        _id: { $ne: sprintObjectId },
        deletedAt: null,
      })
      .exec();

    if (activeSprint) {
      throw new BadRequestException(ErrorFactory.activeSprintExists());
    }

    const tasks = await this.taskModel
      .find({
        workspaceId: workspaceObjectId,
        sprintId: sprintObjectId,
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();

    let committedStoryPoints = 0;
    tasks.forEach(t => {
      committedStoryPoints += t.storyPoints || 0;
    });

    sprint.status = 'active';
    sprint.startDate = new Date(dto.startDate);
    sprint.endDate = new Date(dto.endDate);
    sprint.startedAt = new Date();
    sprint.committedStoryPoints = committedStoryPoints;
    sprint.committedTasksCount = tasks.length;

    return sprint.save();
  }

  async completeSprint(
    workspaceId: string,
    sprintId: string,
    dto: CompleteSprintDto,
  ): Promise<any> {
    this.logger.log(
      `Completing sprint: ${sprintId} for workspace: ${workspaceId}`,
    );

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const sprintObjectId = new Types.ObjectId(sprintId);
    const moveToSprintObjectId = dto.moveToSprintId
      ? new Types.ObjectId(dto.moveToSprintId)
      : null;

    const sprint = await this.sprintModel
      .findOne({
        _id: sprintObjectId,
        workspaceId: workspaceObjectId,
        deletedAt: null,
      })
      .exec();

    if (!sprint) {
      throw new NotFoundException(ErrorFactory.sprintNotFound(sprintId));
    }

    if (sprint.status !== 'active') {
      throw new BadRequestException(
        ErrorFactory.sprintInvalidStatus('active', sprint.status),
      );
    }

    if (moveToSprintObjectId) {
      const targetSprint = await this.sprintModel
        .findOne({
          _id: moveToSprintObjectId,
          workspaceId: workspaceObjectId,
          status: 'planning',
          deletedAt: null,
        })
        .exec();

      if (!targetSprint) {
        throw new BadRequestException(ErrorFactory.sprintTargetInvalid());
      }
    }

    const completedStatuses =
      await this.boardStatusService.getCompletedStatuses(workspaceObjectId);

    const updateFields: any = { sprintId: moveToSprintObjectId };
    if (!moveToSprintObjectId) {
      updateFields.columnId = 'todo';
      updateFields.status = 'todo';
    }

    await this.taskModel
      .updateMany(
        {
          workspaceId: workspaceObjectId,
          sprintId: sprintObjectId,
          isDeleted: { $ne: true },
          status: { $nin: completedStatuses },
        },
        { $set: updateFields },
      )
      .exec();

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    const savedSprint = await sprint.save();

    return {
      _id: savedSprint._id,
      workspaceId: savedSprint.workspaceId,
      name: savedSprint.name,
      status: savedSprint.status,
      completedAt: savedSprint.completedAt,
      incompleteTasksMovedTo: moveToSprintObjectId,
    };
  }
}
