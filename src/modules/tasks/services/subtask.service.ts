import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { SubtaskSummaryDto } from '../dtos/responses/task-detail.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskWriteRepository } from '../repositories/task-write.repository';
import { TaskAccessService } from './task-access.service';
import { TaskCreateService } from './task-create.service';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';

@Injectable()
export class SubtaskService {
  private readonly logger = new Logger(SubtaskService.name);

  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskWriteRepository: TaskWriteRepository,
    private readonly taskMapper: TaskMapper,
    private readonly taskCreateService: TaskCreateService,
    private readonly taskAccessService: TaskAccessService,
    private readonly validationService: TaskCreationValidationService,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
  ) {}

  // create Subtask
  async createSubtask(
    parentId: string,
    dto: Omit<CreateTaskDto, 'type' | 'epicId' | 'storyPoints'>,
    userId: string,
    workspaceId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(parentId, 'Parent task');

    const parent = await this.taskReadRepository.findByIdInWorkspace(
      parentId,
      workspaceId,
    );
    if (!parent) {
      throw new NotFoundException(`Parent task with ID ${parentId} not found`);
    }

    if (parent.type === 'subtask') {
      throw new BadRequestException(
        'Cannot create a subtask under another subtask (only one level of nesting allowed)',
      );
    }

    if (parent.type === 'epic') {
      throw new BadRequestException(
        'Cannot create a subtask under an Epic. Use child issues instead.',
      );
    }

    const parentPlain =
      typeof parent.toObject === 'function' ? parent.toObject() : parent;

    const createDto: CreateTaskDto = {
      ...dto,
      type: 'subtask',
      parentId,
      sprintId: parentPlain.sprintId
        ? parentPlain.sprintId.toString()
        : undefined,
    };

    const task = await this.taskCreateService.createInWorkspaceId(
      workspaceId,
      createDto,
      userId,
    );

    this.logger.log(
      `Subtask created: ${task.key} under parent ${parentPlain.key}`,
    );
    return task;
  }

  // Query subtasks
  async getSubtasksOfTask(
    parentId: string,
    workspaceId: string,
    userId: string,
  ): Promise<{
    subtasks: SubtaskSummaryDto[];
    progress: { done: number; total: number };
  }> {
    this.validationService.validateObjectId(parentId, 'Parent task');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const parent = await this.taskReadRepository.findByIdInWorkspace(
      parentId,
      workspaceId,
    );
    if (!parent) {
      throw new NotFoundException(`Task with ID ${parentId} not found`);
    }

    const subtasks = await this.taskReadRepository.findSubtasksByParentId(
      parentId,
      workspaceId,
    );

    const mappedSubtasks = this.taskMapper.mapSubtaskSummaries(subtasks);
    const progress = await this.getSubtaskProgress(parentId);

    return {
      subtasks: mappedSubtasks,
      progress,
    };
  }

  async getSubtaskProgress(
    parentId: string,
  ): Promise<{ done: number; total: number }> {
    const [total, done] = await Promise.all([
      this.taskReadRepository.countSubtasksByParentId(parentId),
      this.taskReadRepository.countDoneSubtasksByParentId(parentId),
    ]);
    return { done, total };
  }

  // Delete Subtask
  async deleteSubtask(
    parentId: string,
    subtaskId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(parentId, 'Parent task');
    this.validationService.validateObjectId(subtaskId, 'Subtask');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const subtask = await this.taskReadRepository.findByIdInWorkspace(
      subtaskId,
      workspaceId,
    );
    if (!subtask) {
      throw new NotFoundException(`Subtask with ID ${subtaskId} not found`);
    }
    if (subtask.type !== 'subtask') {
      throw new BadRequestException(`Task ${subtaskId} is not a subtask`);
    }
    if (!subtask.parentId || subtask.parentId.toString() !== parentId) {
      throw new BadRequestException(
        `Subtask ${subtaskId} does not belong to task ${parentId}`,
      );
    }

    const deleted = await this.taskWriteRepository.softDeleteInWorkspace(
      subtaskId,
      workspaceId,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException(`Subtask with ID ${subtaskId} not found`);
    }

    await this.taskActivitiesService.recordTaskPermanentlyDeleted(
      deleted,
      userId,
    );
    this.taskDomainEventPublisher.publishDeleted(deleted, userId);

    this.logger.log(`Subtask ${subtaskId} deleted from parent ${parentId}`);
    return this.taskMapper.mapToDto(deleted);
  }

  // Convert Subtask to Task
  async convertSubtaskToTask(
    subtaskId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(subtaskId, 'Subtask');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const subtask = await this.taskReadRepository.findByIdInWorkspace(
      subtaskId,
      workspaceId,
    );
    if (!subtask) {
      throw new NotFoundException(`Subtask with ID ${subtaskId} not found`);
    }
    if (subtask.type !== 'subtask') {
      throw new BadRequestException(`Task ${subtaskId} is not a subtask`);
    }

    // Unset parentId, change type to task
    await (this.taskWriteRepository as any).taskModel.findOneAndUpdate(
      { _id: subtask._id },
      {
        $set: { type: 'task' },
        $unset: { parentId: 1 },
        $inc: { version: 1 },
      },
    );

    this.logger.log(`Subtask ${subtaskId} converted to task`);
    const result = await this.taskReadRepository.findByIdInWorkspace(
      subtaskId,
      workspaceId,
      { includeArchived: true },
    );

    if (result) {
      await this.taskActivitiesService.recordTaskUpdated(
        subtask,
        result,
        userId,
      );
      this.taskDomainEventPublisher.publishUpdated(subtask, result, userId);
    }

    return this.taskMapper.mapToDto(result!);
  }

  // Convert Task to Subtask
  async convertTaskToSubtask(
    taskId: string,
    newParentId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(taskId, 'Task');
    this.validationService.validateObjectId(newParentId, 'Parent task');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    if (taskId === newParentId) {
      throw new BadRequestException('A task cannot be its own parent');
    }

    const [task, parent] = await Promise.all([
      this.taskReadRepository.findByIdInWorkspace(taskId, workspaceId),
      this.taskReadRepository.findByIdInWorkspace(newParentId, workspaceId),
    ]);

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (!parent) {
      throw new NotFoundException(
        `Parent task with ID ${newParentId} not found`,
      );
    }

    if (task.type === 'epic') {
      throw new BadRequestException('Cannot convert an Epic to a subtask');
    }

    if (parent.type === 'subtask') {
      throw new BadRequestException(
        'Parent task cannot be a subtask (only one level of nesting allowed)',
      );
    }

    if (parent.type === 'epic') {
      throw new BadRequestException(
        'Cannot convert a task to a subtask under an Epic. Use child issues instead.',
      );
    }

    const childCount =
      await this.taskReadRepository.countSubtasksByParentId(taskId);
    if (childCount > 0) {
      throw new BadRequestException(
        `Task has ${childCount} subtask(s). Remove or move them before converting to a subtask.`,
      );
    }

    const parentPlain =
      typeof parent.toObject === 'function' ? parent.toObject() : parent;

    await (this.taskWriteRepository as any).taskModel.findOneAndUpdate(
      { _id: task._id },
      {
        $set: {
          type: 'subtask',
          parentId: parent._id,
          ...(parentPlain.sprintId ? { sprintId: parentPlain.sprintId } : {}),
        },
        $unset: {
          epicId: 1,
          storyPoints: 1,
          ...(!parentPlain.sprintId ? { sprintId: 1 } : {}),
        },
        $inc: { version: 1 },
      },
    );

    this.logger.log(`Task ${taskId} converted to subtask under ${newParentId}`);
    const result = await this.taskReadRepository.findByIdInWorkspace(
      taskId,
      workspaceId,
      { includeArchived: true },
    );

    if (result) {
      await this.taskActivitiesService.recordTaskUpdated(task, result, userId);
      this.taskDomainEventPublisher.publishUpdated(task, result, userId);
    }

    return this.taskMapper.mapToDto(result!);
  }
}
