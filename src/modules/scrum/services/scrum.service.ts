import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sprint, SprintDocument } from './schemas/sprint.schema';
import { CreateSprintDto, UpdateSprintDto } from './dtos/sprint.dto';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';

@Injectable()
export class ScrumService {
  private readonly logger = new Logger(ScrumService.name);

  constructor(
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
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

    const sprint = await this.sprintModel.findById(sprintId).exec();
    if (!sprint) throw new NotFoundException('Sprint not found');
    
    sprint.status = 'active';
    sprint.startedAt = new Date();
    return sprint.save();
  }

  async completeSprint(workspaceId: string, sprintId: string): Promise<SprintDocument> {
    this.logger.log(`Completing sprint: ${sprintId} for workspace: ${workspaceId}`);

    const sprint = await this.sprintModel.findById(sprintId).exec();
    if (!sprint) throw new NotFoundException('Sprint not found');
    if (sprint.status !== 'active') throw new BadRequestException('Only active sprints can be completed');

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    const savedSprint = await sprint.save();

    // Handle incomplete tasks: move back to backlog (sprintId = null)
    // Assume tasks with status 'done' are complete. Others are incomplete.
    await this.taskModel.updateMany(
      {
        sprintId: new Types.ObjectId(sprintId),
        status: { $ne: 'done' }, // This logic might need refinement based on board mapping
      },
      { $set: { sprintId: null } }
    ).exec();

    return savedSprint;
  }

  async getBacklog(workspaceId: string): Promise<any> {
    // Tasks not in any sprint or in planning sprints
    const tasks = await this.taskModel.find({
      workspaceId: new Types.ObjectId(workspaceId),
      $or: [
        { sprintId: null },
        { 
          sprintId: { 
            $in: await this.sprintModel.find({ 
              workspaceId: new Types.ObjectId(workspaceId), 
              status: 'planning' 
            }).distinct('_id') 
          } 
        }
      ]
    }).exec();

    return tasks;
  }
}
