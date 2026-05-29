import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ScrumService } from '../../scrum/services/scrum.service';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskCounterService } from './task-counter.service';
import { TaskDataTransformerService } from './task-data-transformer.service';
import { TaskKeyService } from './task-key.service';
import { TaskNormalizerService } from './task-normalizer.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
    private readonly taskKeyService: TaskKeyService,
    private readonly taskCounterService: TaskCounterService,
    private readonly validationService: TaskCreationValidationService,
    private readonly normalizerService: TaskNormalizerService,
    private readonly transformerService: TaskDataTransformerService,
    private readonly scrumService: ScrumService,
    private readonly taskActivitiesService: TaskActivitiesService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskDto> {
    const workspaceId = this.getRequiredWorkspaceId(createTaskDto);
    const workspace = await this.validationService.validateCreateRequest(
      createTaskDto,
      workspaceId,
      userId,
    );
    const normalizedDto =
      await this.normalizerService.normalizeForWorkspaceType(
        createTaskDto,
        workspace,
      );
    const key = await this.createTaskKey(workspace);
    const taskData = this.transformerService.transformCreateInput(
      normalizedDto,
      workspaceId,
      userId,
      key,
    );

    const task = await this.tasksRepository.create(taskData);
    await this.taskActivitiesService.recordTaskCreated(task, userId);
    this.logger.log(`Task created: ${key} in workspace ${workspaceId}`);
    return this.taskMapper.mapToDto(task);
  }

  async createInWorkspaceKey(
    workspaceKey: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    const workspace = await this.validationService.getWorkspaceByKey(workspaceKey);
    return this.create(
      { ...createTaskDto, workspaceId: workspace._id.toString() },
      userId,
    );
  }

  async findAll(
    filterDto: FilterTaskDto,
    currentUserId?: string,
  ): Promise<TaskListDto> {
    if (filterDto.workspaceId && currentUserId) {
      await this.validationService.validateWorkspaceMember(
        filterDto.workspaceId,
        currentUserId,
      );
    }

    const result = await this.tasksRepository.findAll(filterDto);
    return {
      tasks: this.taskMapper.mapToDtos(result.tasks),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findByWorkspace(
    workspaceId: string,
    currentUserId?: string,
  ): Promise<TaskDto[]> {
    this.validationService.validateObjectId(workspaceId, 'Workspace');
    if (currentUserId) {
      await this.validationService.validateWorkspaceMember(
        workspaceId,
        currentUserId,
      );
    }

    const tasks = await this.tasksRepository.findByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findByWorkspaceKey(
    workspaceKey: string,
    currentUserId?: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskDto[]> {
    const workspace = await this.validationService.getWorkspaceByKey(workspaceKey);
    const workspaceId = workspace._id.toString();

    if (currentUserId) {
      await this.validationService.validateWorkspaceMember(
        workspaceId,
        currentUserId,
      );
    }

    const result = await this.tasksRepository.findAll({
      ...filterDto,
      workspaceId,
    });

    return this.taskMapper.mapToDtos(result.tasks);
  }

  async findArchivedByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const workspace = await this.validationService.getWorkspaceByKey(workspaceKey);
    const workspaceId = workspace._id.toString();
    await this.validationService.validateWorkspaceMember(workspaceId, currentUserId);

    const tasks = await this.tasksRepository.findArchivedByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findBacklogByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace, workspaceId } = await this.getWorkspaceContext(
      workspaceKey,
      currentUserId,
    );
    this.ensureScrumWorkspace(workspace);

    const tasks = await this.tasksRepository.findBacklogByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findActiveSprintBoardByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace, workspaceId } = await this.getWorkspaceContext(
      workspaceKey,
      currentUserId,
    );
    this.ensureScrumWorkspace(workspace);

    const activeSprint = await this.scrumService.getActiveSprint(workspaceId);
    if (!activeSprint) {
      return [];
    }

    const tasks = await this.tasksRepository.findBySprintInWorkspace(
      workspaceId,
      activeSprint._id.toString(),
    );
    return this.taskMapper.mapToDtos(tasks);
  }

  async findTasksBySprintInWorkspaceKey(
    workspaceKey: string,
    sprintId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace, workspaceId } = await this.getWorkspaceContext(
      workspaceKey,
      currentUserId,
    );
    this.ensureScrumWorkspace(workspace);
    await this.scrumService.findByIdInWorkspace(workspaceId, sprintId);

    const tasks = await this.tasksRepository.findBySprintInWorkspace(
      workspaceId,
      sprintId,
    );
    return this.taskMapper.mapToDtos(tasks);
  }

  async findById(id: string): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');

    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByIdInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.getWorkspaceContext(workspaceKey, userId);
    const task = await this.getTaskForWorkspace(taskId, workspaceId);

    return this.taskMapper.mapToDto(task);
  }

  async findByIdForAccessCheck(id: string): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');

    const task = await this.tasksRepository.findById(id, {
      includeArchived: true,
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByKey(key: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findByKey(key);
    if (!task) {
      throw new NotFoundException(`Task with key ${key} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByKeyInWorkspaceKey(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.getWorkspaceContext(workspaceKey, userId);
    const task = await this.tasksRepository.findByKeyInWorkspace(taskKey, workspaceId);
    if (!task) {
      throw new NotFoundException(`Task with key ${taskKey} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');
    this.assertMetadataUpdateOnly(updateTaskDto);

    const existing = await this.tasksRepository.findById(id, {
      includeArchived: true,
    });
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    if (existing.isArchived) {
      throw new BadRequestException('Archived task cannot be updated');
    }

    const workspaceId = this.toId(existing.workspaceId);
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

    const task = await this.tasksRepository.update(
      id,
      this.transformerService.transformUpdateInput(normalizedUpdateDto),
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
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
    const { workspaceId } = await this.getWorkspaceContext(workspaceKey, userId);
    const existing = await this.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });

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

    const task = await this.tasksRepository.updateInWorkspace(
      taskId,
      workspaceId,
      this.transformerService.transformUpdateInput(normalizedUpdateDto),
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskUpdated(
      existing,
      task,
      userId,
    );

    return this.taskMapper.mapToDto(task);
  }

  async archiveInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.getWorkspaceContext(workspaceKey, userId);

    const task = await this.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });
    if (task.isArchived) {
      return this.taskMapper.mapToDto(task);
    }

    const archived = await this.tasksRepository.archiveInWorkspace(
      taskId,
      workspaceId,
      userId,
    );
    if (!archived) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskArchived(archived, userId);

    return this.taskMapper.mapToDto(archived);
  }

  async restoreInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.getWorkspaceContext(workspaceKey, userId);

    await this.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });

    const restored = await this.tasksRepository.restoreInWorkspace(taskId, workspaceId);
    if (!restored) {
      throw new NotFoundException(`Archived task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskRestored(restored, userId);

    return this.taskMapper.mapToDto(restored);
  }

  async deletePermanentlyInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    if (confirmText !== 'delete') {
      throw new BadRequestException('Type "delete" to permanently delete this task');
    }

    const { workspaceId } = await this.getWorkspaceContext(workspaceKey, userId);

    await this.getTaskForWorkspace(taskId, workspaceId, {
      includeArchived: true,
    });

    const deleted = await this.tasksRepository.softDeleteInWorkspace(
      taskId,
      workspaceId,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskPermanentlyDeleted(
      deleted,
      userId,
    );

    return this.taskMapper.mapToDto(deleted);
  }

  private async createTaskKey(workspace: any): Promise<string> {
    const workspaceId = workspace._id.toString();
    const taskNumber = await this.taskCounterService.nextSequence(workspaceId);

    return this.taskKeyService.create(
      workspace.key || workspace.name,
      taskNumber,
    );
  }

  private getRequiredWorkspaceId(dto: CreateTaskDto): string {
    if (!dto.workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }

    return dto.workspaceId;
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  private async getWorkspaceContext(
    workspaceKey: string,
    userId: string,
  ): Promise<{ workspace: any; workspaceId: string }> {
    const workspace = await this.validationService.getWorkspaceByKey(workspaceKey);
    const workspaceId = workspace._id.toString();
    await this.validationService.validateWorkspaceMember(workspaceId, userId);

    return { workspace, workspaceId };
  }

  private async getTaskForWorkspace(
    taskId: string,
    workspaceId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<any> {
    this.validationService.validateObjectId(taskId, 'Task');

    const task = await this.tasksRepository.findByIdInWorkspace(
      taskId,
      workspaceId,
      options,
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return task;
  }

  private ensureScrumWorkspace(workspace: any): void {
    if (workspace.type !== 'scrum') {
      throw new BadRequestException('This endpoint is only available for Scrum workspaces');
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
      this.toId(existingTask.sprintId),
    );

    if (currentSprint.status === 'completed') {
      throw new BadRequestException(
        'Task in a completed sprint cannot be reassigned to another sprint',
      );
    }
  }

  private assertMetadataUpdateOnly(updateTaskDto: UpdateTaskDto): void {
    const moveFields = ['columnId', 'status', 'sprintId'] as const;
    const requestedMoveFields = moveFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(updateTaskDto, field),
    );

    if (requestedMoveFields.length > 0) {
      throw new BadRequestException(
        `Use PATCH /workspaces/:key/board/:taskId/move for move fields: ${requestedMoveFields.join(', ')}`,
      );
    }
  }
}
