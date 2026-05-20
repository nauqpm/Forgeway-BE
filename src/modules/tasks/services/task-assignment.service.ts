import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';

@Injectable()
export class TaskAssignmentService {
  private readonly logger = new Logger(TaskAssignmentService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  async assignTo(taskId: string, userId: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const updated = await this.tasksRepository.update(taskId, {
      assigneeId: new Types.ObjectId(userId),
    });
    if (!updated) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Task ${updated.key} assigned to user ${userId}`);
    return this.taskMapper.mapToDto(updated);
  }

  async unassign(taskId: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const updated = await this.tasksRepository.update(taskId, {
      $unset: { assigneeId: '' },
    } as any);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Task ${updated.key} unassigned`);
    return this.taskMapper.mapToDto(updated);
  }
}
