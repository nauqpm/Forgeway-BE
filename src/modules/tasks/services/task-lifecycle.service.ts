import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorFactory } from '../../../common/factories/error.factory';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskWriteRepository } from '../repositories/task-write.repository';
import { TaskAccessService } from './task-access.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';

@Injectable()
export class TaskLifecycleService {
  constructor(
    private readonly tasksRepository: TaskWriteRepository,
    private readonly taskMapper: TaskMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
    private readonly taskAccessService: TaskAccessService,
  ) {}

  async archiveInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );

    const task = await this.taskAccessService.getTaskForWorkspace(
      taskId,
      workspaceId,
      {
        includeArchived: true,
      },
    );
    if (task.isArchived) {
      return this.taskMapper.mapToDto(task);
    }

    const archived = await this.tasksRepository.archiveInWorkspace(
      taskId,
      workspaceId,
      userId,
    );
    if (!archived) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskId));
    }

    await this.taskActivitiesService.recordTaskArchived(archived, userId);
    this.taskDomainEventPublisher.publishArchived(archived, userId);

    return this.taskMapper.mapToDto(archived);
  }

  async archiveTaskKeyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    const task = await this.taskAccessService.getTaskForWorkspaceKey(
      taskKey,
      workspaceId,
      {
        includeArchived: true,
      },
    );
    if (task.isArchived) {
      return this.taskMapper.mapToDto(task);
    }

    const archived = await this.tasksRepository.archiveInWorkspace(
      this.taskAccessService.toId(task._id),
      workspaceId,
      userId,
    );
    if (!archived) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskKey));
    }

    this.taskDomainEventPublisher.publishArchived(archived, userId);

    return this.taskMapper.mapToDto(archived);
  }

  async archiveInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const task = await this.taskAccessService.getTaskForWorkspace(
      taskId,
      workspaceId,
      {
        includeArchived: true,
      },
    );
    if (task.isArchived) {
      return this.taskMapper.mapToDto(task);
    }

    const archived = await this.tasksRepository.archiveInWorkspace(
      taskId,
      workspaceId,
      userId,
    );
    if (!archived) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskId));
    }

    this.taskDomainEventPublisher.publishArchived(archived, userId);

    return this.taskMapper.mapToDto(archived);
  }

  async restoreInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );

    await this.taskAccessService.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });

    const restored = await this.tasksRepository.restoreInWorkspace(
      taskId,
      workspaceId,
    );
    if (!restored) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskId));
    }

    await this.taskActivitiesService.recordTaskRestored(restored, userId);
    this.taskDomainEventPublisher.publishRestored(restored, userId);

    return this.taskMapper.mapToDto(restored);
  }

  async restoreTaskKeyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    const task = await this.taskAccessService.getTaskForWorkspaceKey(
      taskKey,
      workspaceId,
      {
        includeArchived: true,
      },
    );

    const restored = await this.tasksRepository.restoreInWorkspace(
      this.taskAccessService.toId(task._id),
      workspaceId,
    );
    if (!restored) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskKey));
    }

    this.taskDomainEventPublisher.publishRestored(restored, userId);

    return this.taskMapper.mapToDto(restored);
  }

  async restoreInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    await this.taskAccessService.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });

    const restored = await this.tasksRepository.restoreInWorkspace(
      taskId,
      workspaceId,
    );
    if (!restored) {
      throw new NotFoundException(`Archived task with ID ${taskId} not found`);
    }

    this.taskDomainEventPublisher.publishRestored(restored, userId);

    return this.taskMapper.mapToDto(restored);
  }

  async deletePermanentlyInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    if (confirmText !== 'delete') {
      throw new BadRequestException(
        'Type "delete" to permanently delete this task',
      );
    }

    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    return this.deletePermanentlyInWorkspaceId(
      workspaceId,
      taskId,
      userId,
      confirmText,
    );
  }

  async deleteTaskKeyPermanentlyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    if (confirmText !== 'delete') {
      throw new BadRequestException(
        'Type "delete" to permanently delete this task',
      );
    }

    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    const task = await this.taskAccessService.getTaskForWorkspaceKey(
      taskKey,
      workspaceId,
      {
        includeArchived: true,
      },
    );

    const deleted = await this.tasksRepository.softDeleteInWorkspace(
      this.taskAccessService.toId(task._id),
      workspaceId,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskKey));
    }

    this.taskDomainEventPublisher.publishDeleted(deleted, userId);

    return this.taskMapper.mapToDto(deleted);
  }

  async deletePermanentlyInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    if (confirmText !== 'delete') {
      throw new BadRequestException(
        'Type "delete" to permanently delete this task',
      );
    }

    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    await this.taskAccessService.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });

    const deleted = await this.tasksRepository.softDeleteInWorkspace(
      taskId,
      workspaceId,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException(ErrorFactory.taskNotFound(taskId));
    }

    await this.taskActivitiesService.recordTaskPermanentlyDeleted(
      deleted,
      userId,
    );
    this.taskDomainEventPublisher.publishDeleted(deleted, userId);

    return this.taskMapper.mapToDto(deleted);
  }
}
