import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';

@Injectable()
export class TaskStatusService {
  private readonly logger = new Logger(TaskStatusService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  async changeStatus(taskId: string, status: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const updated = await this.tasksRepository.update(taskId, {
      columnId: status,
    });
    if (!updated) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(`Task ${updated.key} status changed to ${status}`);
    return this.taskMapper.mapToDto(updated);
  }
}
