import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DependencyType,
  TaskDependency,
  TaskDependencyDocument,
} from '../schemas/task-dependency.schema';

export interface TaskDependencyDto {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  workspaceId: string;
  type: DependencyType;
  createdAt: Date;
}

@Injectable()
export class TaskDependencyService {
  constructor(
    @InjectModel(TaskDependency.name)
    private readonly depModel: Model<TaskDependencyDocument>,
  ) {}

  async findByWorkspace(workspaceId: string): Promise<TaskDependencyDto[]> {
    const docs = await this.depModel
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .lean()
      .exec();
    return docs.map(this.toDto);
  }

  async findByTask(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskDependencyDto[]> {
    const wId = new Types.ObjectId(workspaceId);
    const tId = new Types.ObjectId(taskId);
    const docs = await this.depModel
      .find({
        workspaceId: wId,
        $or: [{ fromTaskId: tId }, { toTaskId: tId }],
      })
      .lean()
      .exec();
    return docs.map(this.toDto);
  }

  async create(
    workspaceId: string,
    fromTaskId: string,
    toTaskId: string,
    type: DependencyType = 'blocks',
  ): Promise<TaskDependencyDto> {
    if (fromTaskId === toTaskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }

    const existing = await this.depModel.findOne({
      workspaceId: new Types.ObjectId(workspaceId),
      fromTaskId: new Types.ObjectId(fromTaskId),
      toTaskId: new Types.ObjectId(toTaskId),
      type,
    });
    if (existing) {
      throw new BadRequestException('This dependency already exists');
    }

    const doc = await this.depModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      fromTaskId: new Types.ObjectId(fromTaskId),
      toTaskId: new Types.ObjectId(toTaskId),
      type,
    });
    return this.toDto(doc.toObject());
  }

  async delete(workspaceId: string, depId: string): Promise<void> {
    if (!Types.ObjectId.isValid(depId)) {
      throw new BadRequestException('Invalid dependency ID');
    }
    const result = await this.depModel.deleteOne({
      _id: new Types.ObjectId(depId),
      workspaceId: new Types.ObjectId(workspaceId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Dependency ${depId} not found`);
    }
  }

  private toDto(doc: any): TaskDependencyDto {
    return {
      id: doc._id.toString(),
      fromTaskId: doc.fromTaskId.toString(),
      toTaskId: doc.toTaskId.toString(),
      workspaceId: doc.workspaceId.toString(),
      type: doc.type,
      createdAt: doc.createdAt,
    };
  }
}
