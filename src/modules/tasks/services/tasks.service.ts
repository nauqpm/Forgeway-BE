import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskCreationValidationService } from './task-creation-validation.service';
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
    private readonly validationService: TaskCreationValidationService,
    private readonly normalizerService: TaskNormalizerService,
    private readonly transformerService: TaskDataTransformerService,
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
  ): Promise<TaskDto[]> {
    const workspace = await this.validationService.getWorkspaceByKey(workspaceKey);
    return this.findByWorkspace(workspace._id.toString(), currentUserId);
  }

  async findById(id: string): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');

    const task = await this.tasksRepository.findById(id);
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

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');

    const existing = await this.tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const workspaceId = this.toId(existing.workspaceId);
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

  async delete(id: string): Promise<void> {
    this.validationService.validateObjectId(id, 'Task');

    const deleted = await this.tasksRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
  }

  private async createTaskKey(workspace: any): Promise<string> {
    const workspaceId = workspace._id.toString();
    const taskNumber =
      (await this.tasksRepository.countByWorkspace(workspaceId)) + 1;

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
}
