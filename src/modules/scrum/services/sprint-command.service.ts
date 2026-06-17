// Xử lý các thao tác thay đổi dữ liệu sprint:
// - tạo sprint
// - cập nhật sprint
// - xóa sprint
// - xóa sprint theo workspace.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { SprintDomainEventPublisher } from './sprint-domain-event.publisher';
import { ErrorFactory } from '../../../common/factories/error.factory';

@Injectable()
export class SprintCommandService {
  private readonly logger = new Logger(SprintCommandService.name);

  constructor(
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly sprintDomainEventPublisher: SprintDomainEventPublisher,
  ) {}

  async createSprint(
    workspaceId: string,
    dto: CreateSprintDto,
    actorId?: string,
  ): Promise<SprintDocument> {
    this.logger.log(`Creating Sprint for Workspace: ${workspaceId}`);

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const count = await this.sprintModel
      .countDocuments({
        workspaceId: workspaceObjectId,
        deletedAt: null,
      })
      .exec();

    const sprintName = dto.name?.trim() || `Sprint ${count + 1}`;

    const nameExists = await this.sprintModel
      .exists({
        workspaceId: workspaceObjectId,
        name: sprintName,
        deletedAt: null,
      })
      .exec();

    if (nameExists) {
      throw new BadRequestException(
        'Sprint name already exists, please choose another name',
      );
    }

    const sprint = new this.sprintModel({
      ...dto,
      workspaceId: workspaceObjectId,
      name: sprintName,
      status: 'planning',
    });

    const createdSprint = await sprint.save();
    this.sprintDomainEventPublisher.publishCreated(createdSprint, actorId);

    return createdSprint;
  }

  async updateSprint(
    workspaceId: string,
    sprintId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintDocument> {
    const timestamp = new Date().toISOString();

    try {
      const sprint = await this.sprintModel
        .findOne({
          _id: new Types.ObjectId(sprintId),
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: null,
        })
        .exec();

      if (!sprint) {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Update Sprint Failed | Sprint ID: ${sprintId} | Error: Sprint not exist`,
        );
        throw new NotFoundException(ErrorFactory.sprintNotFound(sprintId));
      }

      if (sprint.status === 'completed') {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Update Sprint Failed | Sprint ID: ${sprintId} | Error: Cannot edit completed sprint`,
        );
        throw new BadRequestException('Cannot edit completed sprint');
      }

      if (
        sprint.status !== 'planning' &&
        (dto.startDate !== undefined || dto.endDate !== undefined)
      ) {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Update Sprint Failed | Sprint ID: ${sprintId} | Error: Cannot change dates of active or completed sprint`,
        );
        throw new BadRequestException(
          'Cannot change dates of active or completed sprint',
        );
      }

      const oldValues = {
        name: sprint.name,
        goal: sprint.goal,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        duration: sprint.duration,
      };

      if (dto.name !== undefined) {
        const trimmedName = dto.name.trim();
        if (trimmedName !== sprint.name) {
          const nameExists = await this.sprintModel
            .exists({
              workspaceId: new Types.ObjectId(workspaceId),
              name: trimmedName,
              deletedAt: null,
              _id: { $ne: new Types.ObjectId(sprintId) },
            })
            .exec();

          if (nameExists) {
            throw new BadRequestException(
              'Sprint name already exists, please choose another name',
            );
          }
        }
        sprint.name = trimmedName;
      }
      if (dto.goal !== undefined) sprint.goal = dto.goal;
      if (dto.duration !== undefined) sprint.duration = dto.duration;

      let nextStartDate = sprint.startDate;
      let nextEndDate = sprint.endDate;

      if (sprint.status === 'planning') {
        if (dto.startDate !== undefined)
          nextStartDate = new Date(dto.startDate);
        if (dto.endDate !== undefined) nextEndDate = new Date(dto.endDate);
      }

      if (
        nextStartDate &&
        nextEndDate &&
        new Date(nextEndDate).getTime() <= new Date(nextStartDate).getTime()
      ) {
        throw new BadRequestException('EndDate must be greater than StartDate');
      }

      if (sprint.status === 'planning') {
        sprint.startDate = nextStartDate;
        sprint.endDate = nextEndDate;
      }

      const updatedSprint = await sprint.save();

      const newValues = {
        name: updatedSprint.name,
        goal: updatedSprint.goal,
        startDate: updatedSprint.startDate,
        endDate: updatedSprint.endDate,
        duration: updatedSprint.duration,
      };

      this.logger.log(
        `\n================= AUDIT LOG =================\n` +
          `Action: Sprint Update\n` +
          `Status: SUCCESS\n` +
          `Timestamp: ${timestamp}\n` +
          `Sprint ID: ${sprintId}\n` +
          `Workspace ID: ${workspaceId}\n` +
          `Old Values: ${JSON.stringify(oldValues, null, 2)}\n` +
          `Updated Values: ${JSON.stringify(newValues, null, 2)}\n` +
          `=============================================\n`,
      );

      return updatedSprint;
    } catch (error) {
      if (
        !(error instanceof NotFoundException) &&
        !(error instanceof BadRequestException)
      ) {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Update Sprint Failed | Sprint ID: ${sprintId} | Error: ${error}`,
        );
      }
      throw error;
    }
  }

  async deleteSprint(workspaceId: string, sprintId: string): Promise<void> {
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

    await this.taskModel
      .updateMany(
        {
          workspaceId: workspaceObjectId,
          sprintId: sprint._id,
        },
        {
          $set: {
            sprintId: null,
            columnId: 'todo',
            status: 'todo',
          },
        },
      )
      .exec();

    await this.sprintModel.deleteOne({ _id: sprint._id }).exec();
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Delete all Sprints for Workspace: ${workspaceId}`);
    await this.sprintModel
      .updateMany(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: null,
        },
        { $set: { deletedAt: new Date() } },
      )
      .exec();
  }

  async restoreByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Restore all Sprints for Workspace: ${workspaceId}`);
    await this.sprintModel
      .updateMany(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: { $ne: null },
        },
        { $set: { deletedAt: null } },
      )
      .exec();
  }
}
