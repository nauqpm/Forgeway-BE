import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { ScrumService } from '../../scrum/services/scrum.service';
import { ErrorFactory } from '../../../common/factories/error.factory';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskWriteRepository } from '../repositories/task-write.repository';
import { TaskAccessService } from './task-access.service';
import { TaskAssignmentNotificationService } from './task-assignment-notification.service';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDataTransformerService } from './task-data-transformer.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';
import { TaskNormalizerService } from './task-normalizer.service';

@Injectable()
export class TaskUpdateService {
  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskWriteRepository: TaskWriteRepository,
    private readonly taskMapper: TaskMapper,
    private readonly validationService: TaskCreationValidationService,
    private readonly normalizerService: TaskNormalizerService,
    private readonly transformerService: TaskDataTransformerService,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
    private readonly taskAccessService: TaskAccessService,
    private readonly taskAssignmentNotificationService: TaskAssignmentNotificationService,
    @Inject(forwardRef(() => ScrumService))
    private readonly scrumService: ScrumService,
  ) {}

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');
    this.assertMetadataUpdateOnly(updateTaskDto);

    const existing = await this.taskReadRepository.findTaskById(id, {
      includeArchived: true,
    });
    if (!existing) {
      throw new NotFoundException(ErrorFactory.taskNotFound(id));
    }
    if (existing.isArchived) {
      throw new BadRequestException(ErrorFactory.taskArchived());
    }

    const workspaceId = this.taskAccessService.toId(existing.workspaceId);
    await this.ensureCompletedSprintIsNotReassigned(
      existing,
      updateTaskDto,
      workspaceId,
    );
    const normalizedUpdateDto =
      await this.normalizerService.normalizeUpdateForWorkspaceType(
        updateTaskDto,
        existing,
      );
    await this.validationService.validateUpdateRequest(
      normalizedUpdateDto,
      workspaceId,
    );

    const task = await this.taskWriteRepository.update(
      id,
      this.transformerService.transformUpdateInput(
        normalizedUpdateDto,
        existing,
      ),
    );
    if (!task) {
      throw new NotFoundException(ErrorFactory.taskNotFound(id));
    }

    return this.taskMapper.mapToDto(task);
  }

  async updateInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    this.assertMetadataUpdateOnly(updateTaskDto);
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    const existing = this.taskAccessService.isObjectIdString(taskId)
      ? await this.taskAccessService.getTaskForWorkspace(taskId, workspaceId, {
          includeArchived: true,
        })
      : await this.taskAccessService.getTaskForWorkspaceKey(
          taskId,
          workspaceId,
          {
            includeArchived: true,
          },
        );
    const resolvedTaskId = this.taskAccessService.toId(existing._id);

    if (existing.isArchived) {
      throw new BadRequestException('Archived task cannot be updated');
    }

    await this.ensureCompletedSprintIsNotReassigned(
      existing,
      updateTaskDto,
      workspaceId,
    );
    const normalizedUpdateDto =
      await this.normalizerService.normalizeUpdateForWorkspaceType(
        updateTaskDto,
        existing,
      );
    await this.validationService.validateUpdateRequest(
      normalizedUpdateDto,
      workspaceId,
    );
    await this.ensureCanMoveFromCurrentSprint(
      existing,
      normalizedUpdateDto,
      undefined,
    );

    const task = await this.taskWriteRepository.updateInWorkspace(
      resolvedTaskId,
      workspaceId,
      this.transformerService.transformUpdateInput(
        normalizedUpdateDto,
        existing,
      ),
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskAssignmentNotificationService.notifyAssigneeChanged(
      existing,
      task,
      userId,
      workspaceId,
    );
    this.taskDomainEventPublisher.publishUpdated(existing, task, userId);

    return this.taskMapper.mapToDto(task);
  }

  async updateInWorkspaceId(
    workspaceId: string,
    taskId: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
    userRole?: string,
  ): Promise<TaskDto> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);
    const existing = await this.taskAccessService.getTaskForWorkspace(
      taskId,
      workspaceId,
      {
        includeArchived: true,
      },
    );

    if (existing.isArchived) {
      throw new BadRequestException('Archived task cannot be updated');
    }

    await this.ensureCompletedSprintIsNotReassigned(
      existing,
      updateTaskDto,
      workspaceId,
    );
    const normalizedUpdateDto =
      await this.normalizerService.normalizeUpdateForWorkspaceType(
        updateTaskDto,
        existing,
      );
    await this.validationService.validateUpdateRequest(
      normalizedUpdateDto,
      workspaceId,
    );
    await this.ensureCanMoveFromCurrentSprint(
      existing,
      normalizedUpdateDto,
      userRole,
    );

    const task = await this.taskWriteRepository.updateInWorkspace(
      taskId,
      workspaceId,
      this.transformerService.transformUpdateInput(
        normalizedUpdateDto,
        existing,
      ),
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskAssignmentNotificationService.notifyAssigneeChanged(
      existing,
      task,
      userId,
      workspaceId,
    );
    await this.taskActivitiesService.recordTaskUpdated(existing, task, userId);

    // Ghi nhận activity Log Work riêng biệt nếu có cập nhật timeLogged
    if (updateTaskDto.timeLogged !== undefined) {
      await this.taskActivitiesService.recordWorkLogged(
        task,
        userId,
        updateTaskDto.timeLogged,
        updateTaskDto.timeEstimated,
      );
    }

    this.taskDomainEventPublisher.publishUpdated(existing, task, userId);

    return this.taskMapper.mapToDto(task);
  }

  private async ensureCanMoveFromCurrentSprint(
    task: any,
    updateTaskDto: UpdateTaskDto,
    userRole?: string,
  ): Promise<void> {
    if (updateTaskDto.sprintId === undefined || userRole === 'super_admin') {
      return;
    }

    const currentSprintId = this.taskAccessService.toId(task.sprintId);
    if (!currentSprintId) {
      return;
    }

    const nextSprintId = updateTaskDto.sprintId ?? '';
    if (nextSprintId === currentSprintId) {
      return;
    }

    const currentSprint =
      await this.scrumService.findSprintById(currentSprintId);
    if (currentSprint?.status === 'completed') {
      throw new BadRequestException(
        'Cannot move tasks out of a completed sprint without super_admin role',
      );
    }
  }

  private async ensureCompletedSprintIsNotReassigned(
    existingTask: any,
    updateTaskDto: UpdateTaskDto,
    workspaceId: string,
  ): Promise<void> {
    if (updateTaskDto.sprintId === undefined || !existingTask.sprintId) {
      return;
    }

    const currentSprint = await this.scrumService.findByIdInWorkspace(
      workspaceId,
      this.taskAccessService.toId(existingTask.sprintId),
    );

    if (currentSprint.status === 'completed') {
      throw new BadRequestException(
        'Task in a completed sprint cannot be reassigned to another sprint',
      );
    }
  }

  private assertMetadataUpdateOnly(updateTaskDto: UpdateTaskDto): void {
    const moveFields = ['columnId', 'status', 'sprintId'] as const;
    const requestedMoveFields = moveFields.filter(field =>
      Object.prototype.hasOwnProperty.call(updateTaskDto, field),
    );

    if (requestedMoveFields.length > 0) {
      throw new BadRequestException(
        `Use PATCH /workspaces/:key/board/:taskId/move for move fields: ${requestedMoveFields.join(', ')}`,
      );
    }
  }
}
