// Xử lý vòng đời sprint: start sprint và complete sprint.
// File này kiểm tra trạng thái sprint, kiểm tra active sprint hiện tại,
// validate target sprint khi đóng sprint, move incomplete tasks.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CompleteSprintDto, StartSprintDto } from '../dtos/sprint.dto';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { BoardStatusService } from './board-status.service';

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
      throw new NotFoundException('Sprint not exist');
    }

    if (sprint.status !== 'planning') {
      throw new BadRequestException(
        'Only sprint in planning status can be started',
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
      throw new BadRequestException(
        'Cannot start sprint: There is already an active sprint in this workspace.',
      );
    }

    sprint.status = 'active';
    sprint.startDate = new Date(dto.startDate);
    sprint.endDate = new Date(dto.endDate);
    sprint.startedAt = new Date();

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
      throw new NotFoundException('Sprint not exist');
    }

    if (sprint.status !== 'active') {
      throw new BadRequestException(
        'Only sprint in active status can be completed',
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
        throw new BadRequestException(
          'moveToSprintId is invalid: Target sprint must exist, belong to the same workspace, and be in the planning status',
        );
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
