import { Injectable, Logger } from '@nestjs/common';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskWriteRepository } from '../repositories/task-write.repository';
import { TaskRankRepository } from '../repositories/task-rank.repository';
import { compareRanks, generateRankBetween } from '../utils/rank.util';
import { TaskAccessService } from './task-access.service';
import { TaskCounterService } from './task-counter.service';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDataTransformerService } from './task-data-transformer.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';
import { TaskKeyService } from './task-key.service';
import { TaskNormalizerService } from './task-normalizer.service';

@Injectable()
export class TaskCreateService {
  private readonly logger = new Logger(TaskCreateService.name);

  constructor(
    private readonly taskWriteRepository: TaskWriteRepository,
    private readonly taskRankRepository: TaskRankRepository,
    private readonly taskMapper: TaskMapper,
    private readonly taskKeyService: TaskKeyService,
    private readonly taskCounterService: TaskCounterService,
    private readonly validationService: TaskCreationValidationService,
    private readonly normalizerService: TaskNormalizerService,
    private readonly transformerService: TaskDataTransformerService,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
    private readonly taskAccessService: TaskAccessService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskDto> {
    const workspaceId =
      this.taskAccessService.getRequiredWorkspaceId(createTaskDto);
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
    taskData.rank = await this.createInitialRankForTask(
      workspace.type,
      workspaceId,
      normalizedDto,
    );

    const task = await this.taskWriteRepository.create(taskData);
    await this.taskActivitiesService.recordTaskCreated(task, userId);
    this.taskDomainEventPublisher.publishCreated(task, userId);
    this.logger.log(`Task created: ${key} in workspace ${workspaceId}`);
    return this.taskMapper.mapToDto(task);
  }

  async createInWorkspaceKey(
    workspaceKey: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    const workspace =
      await this.validationService.getWorkspaceById(workspaceKey);
    return this.createInWorkspaceId(
      workspace._id.toString(),
      createTaskDto,
      userId,
    );
  }

  async createInWorkspaceId(
    workspaceId: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    return this.create({ ...createTaskDto, workspaceId }, userId);
  }

  private async createTaskKey(workspace: any): Promise<string> {
    const workspaceId = workspace._id.toString();
    const taskNumber = await this.taskCounterService.nextSequence(workspaceId);

    return this.taskKeyService.create(
      workspace.key || workspace.name,
      taskNumber,
    );
  }

  private async createInitialRankForTask(
    workspaceType: string | undefined,
    workspaceId: string,
    dto: CreateTaskDto,
  ): Promise<string> {
    const scope =
      workspaceType === 'scrum'
        ? { workspaceId, sprintId: dto.sprintId ?? null }
        : { workspaceId, columnId: dto.columnId };
    const tasks = await this.taskRankRepository.findTasksInRankScope(scope);
    const lastTask = tasks
      .filter(task => Boolean(task.rank))
      .sort((left, right) => {
        const rankDiff = compareRanks(left.rank, right.rank);
        if (rankDiff !== 0) return rankDiff;
        return (
          this.taskAccessService.toTimestamp(left.createdAt) -
          this.taskAccessService.toTimestamp(right.createdAt)
        );
      })
      .at(-1);

    return generateRankBetween(undefined, lastTask?.rank);
  }
}
