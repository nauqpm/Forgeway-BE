import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Board, BoardDocument } from '../../kanban/schemas/kanban-board.schema';

@Injectable()
export class ScrumService {
  private readonly logger = new Logger(ScrumService.name);

  constructor(
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Board.name) private readonly boardModel: Model<BoardDocument>,
  ) {}

  async createSprint(workspaceId: string, dto: CreateSprintDto): Promise<SprintDocument> {
    this.logger.log(`Creating sprint for Workspace: ${workspaceId}`);
    const sprint = new this.sprintModel({
      ...dto,
      workspaceId: new Types.ObjectId(workspaceId),
      status: 'planning',
    });
    return sprint.save();
  }

  async findByWorkspace(workspaceId: string): Promise<SprintDocument[]> {
    return this.sprintModel.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ createdAt: -1 }).exec();
  }

  async startSprint(workspaceId: string, sprintId: string): Promise<SprintDocument> {
    this.logger.log(`Starting sprint: ${sprintId} for workspace: ${workspaceId}`);

    // Rule: Only one active sprint per workspace
    const activeSprint = await this.sprintModel.findOne({
      workspaceId: new Types.ObjectId(workspaceId),
      status: 'active',
    }).exec();

    if (activeSprint) {
      throw new BadRequestException('Cannot start sprint: There is already an active sprint in this workspace.');
    }

    const sprint = await this.sprintModel
      .findOne({ _id: new Types.ObjectId(sprintId), workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    if (!sprint) throw new NotFoundException('Sprint not found');

    sprint.status = 'active';
    sprint.startedAt = new Date();
    return sprint.save();
  }

  async completeSprint(workspaceId: string, sprintId: string): Promise<SprintDocument> {
    this.logger.log(`Completing sprint: ${sprintId} for workspace: ${workspaceId}`);

    const sprint = await this.sprintModel
      .findOne({ _id: new Types.ObjectId(sprintId), workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    if (!sprint) throw new NotFoundException('Sprint not found');
    if (sprint.status !== 'active') throw new BadRequestException('Only active sprints can be completed');

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    const savedSprint = await sprint.save();

    // Resolve done statuses from board columns
    const board = await this.boardModel
      .findOne({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    const doneStatuses: string[] = board
      ? board.columns
          .filter(col =>
            col.id?.toLowerCase() === 'done' ||
            (col.mappedStatuses || []).some(s => s.toLowerCase() === 'done')
          )
          .flatMap(col => col.mappedStatuses || [])
      : ['done'];
    if (doneStatuses.length === 0) doneStatuses.push('done');

    await this.taskModel.updateMany(
      { sprintId: new Types.ObjectId(sprintId), status: { $nin: doneStatuses } },
      { $set: { sprintId: null } },
    ).exec();

    return savedSprint;
  }

  async getBacklog(workspaceId: string): Promise<any> {
    const planningSprints = await this.sprintModel
      .find({ workspaceId: new Types.ObjectId(workspaceId), status: 'planning' })
      .select('_id')
      .lean()
      .exec();
    const planningIds = planningSprints.map(s => s._id);

    return this.taskModel.find({
      workspaceId: new Types.ObjectId(workspaceId),
      $or: [
        { sprintId: null },
        { sprintId: { $in: planningIds } },
      ],
    }).exec();
  }

  async updateSprint(workspaceId: string, sprintId: string, dto: UpdateSprintDto): Promise<SprintDocument> {
    const timestamp = new Date().toISOString();
    
    try {
      const sprint = await this.sprintModel
        .findOne({ _id: new Types.ObjectId(sprintId), workspaceId: new Types.ObjectId(workspaceId) })
        .exec();
        
      if (!sprint) {
        this.logger.error(`[AUDIT LOG] [${timestamp}] Sprint Update FAILED | Sprint ID: ${sprintId} | Error: Sprint not found`);
        throw new NotFoundException('Sprint not found');
      }

      if (sprint.status !== 'planning' && (dto.startDate !== undefined || dto.endDate !== undefined)) {
        throw new BadRequestException('Cannot change sprint dates while sprint is active or completed');
      }

      const oldValues = {
        name: sprint.name,
        goal: sprint.goal,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        duration: sprint.duration,
      };

      if (dto.name !== undefined) sprint.name = dto.name;
      if (dto.goal !== undefined) sprint.goal = dto.goal;
      if (dto.duration !== undefined) sprint.duration = dto.duration;
      
      if (sprint.status === 'planning') {
        if (dto.startDate !== undefined) sprint.startDate = new Date(dto.startDate);
        if (dto.endDate !== undefined) sprint.endDate = new Date(dto.endDate);
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
        `=============================================\n`
      );

      return updatedSprint;
    } catch (error) {
      if (!(error instanceof NotFoundException) && !(error instanceof BadRequestException)) {
        this.logger.error(`[AUDIT LOG] [${timestamp}] Sprint Update FAILED | Sprint ID: ${sprintId} | Error: ${error.message}`);
      }
      throw error;
    }
  }

  async deleteSprint(workspaceId: string, sprintId: string): Promise<void> {
    const sprint = await this.sprintModel
      .findOne({ _id: new Types.ObjectId(sprintId), workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    if (!sprint) throw new NotFoundException('Sprint not found');
    if (sprint.status !== 'planning') {
      throw new BadRequestException('Only planning sprints can be deleted');
    }
    await sprint.deleteOne();
  }

  async getActiveSprint(workspaceId: string): Promise<SprintDocument | null> {
    return this.sprintModel
      .findOne({ workspaceId: new Types.ObjectId(workspaceId), status: 'active' })
      .exec();
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Deleting all sprints for Workspace: ${workspaceId}`);
    await this.sprintModel.deleteMany({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
  }
}
