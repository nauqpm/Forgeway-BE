import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';

@Injectable()
export class TaskMovementService {
  private readonly logger = new Logger(TaskMovementService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  async moveToBoard(
    taskId: string,
    boardId: string,
    columnId: string,
  ): Promise<TaskDto> {
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const updated = await this.tasksRepository.update(taskId, {
      boardId: new Types.ObjectId(boardId),
      boardColumnId: columnId,
    });
    if (!updated) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    this.logger.log(
      `Task ${updated.key} moved to board ${boardId}, column ${columnId}`,
    );
    return this.taskMapper.mapToDto(updated);
  }
}
