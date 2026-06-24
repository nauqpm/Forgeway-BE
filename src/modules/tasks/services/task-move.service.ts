import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScrumService } from '../../scrum/services/scrum.service';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { MoveTaskDto } from '../dtos/requests/move-task.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskMovePolicy } from '../policies/task-move.policy';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskRankRepository } from '../repositories/task-rank.repository';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';

export interface TaskMoveAuditMetadata {
  taskId: string;
  taskKey: string;
  fromColumn?: string;
  toColumn?: string;
  fromStatus?: string;
  toStatus?: string;
  fromSprint?: string | null;
  toSprint?: string | null;
  fromRank?: string;
  toRank?: string;
}

export interface TaskMoveResult {
  task: TaskDto;
  auditMetadata: TaskMoveAuditMetadata;
}

@Injectable()
export class TaskMoveService {
  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskRankRepository: TaskRankRepository,
    private readonly validationService: TaskCreationValidationService,
    private readonly scrumService: ScrumService,
    private readonly taskMovePolicy: TaskMovePolicy,
    private readonly taskMapper: TaskMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
  ) {}

  async moveInWorkspaceId(
    workspaceId: string,
    taskId: string,
    dto: MoveTaskDto,
    userId: string,
  ): Promise<TaskMoveResult> {
    this.ensureMoveHasMutation(dto);

    const workspace =
      await this.validationService.getWorkspaceById(workspaceId);
    await this.validationService.validateWorkspaceMember(workspaceId, userId);
    this.validationService.validateObjectId(taskId, 'Task');

    const task = await this.taskReadRepository.findByIdInWorkspace(
      taskId,
      workspaceId,
      {
        includeArchived: true,
        includeDeleted: true,
      },
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (dto.sprintId && workspace.type !== 'scrum') {
      throw new BadRequestException(
        'Only Scrum tasks can be moved into a sprint',
      );
    }

    const currentSprint = task.sprintId
      ? await this.scrumService.findByIdInWorkspace(
          workspaceId,
          this.toOptionalId(task.sprintId) as string,
        )
      : null;

    const targetSprint = dto.sprintId
      ? await this.scrumService.findByIdInWorkspace(workspaceId, dto.sprintId)
      : null;

    this.taskMovePolicy.validateMove(task, targetSprint, currentSprint);

    const movedTask = await this.taskRankRepository.moveTaskInWorkspace(
      taskId,
      workspaceId,
      {
        columnId: dto.columnId,
        status: dto.status,
        sprintId: dto.sprintId,
        rank: dto.rank,
      },
    );

    if (!movedTask) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskMoved(task, movedTask, userId);
    this.taskDomainEventPublisher.publishMoved(task, movedTask, userId);

    return {
      task: this.taskMapper.mapToDto(movedTask),
      auditMetadata: {
        taskId,
        taskKey: task.key,
        fromColumn: task.columnId,
        toColumn: dto.columnId,
        fromStatus: task.status,
        toStatus: dto.status,
        fromSprint: this.toOptionalId(task.sprintId) ?? null,
        toSprint: dto.sprintId ?? null,
        fromRank: task.rank,
        toRank: dto.rank,
      },
    };
  }

  private ensureMoveHasMutation(dto: MoveTaskDto): void {
    const hasMutation =
      dto.columnId !== undefined ||
      dto.status !== undefined ||
      dto.sprintId !== undefined ||
      dto.rank !== undefined;

    if (!hasMutation) {
      throw new BadRequestException(
        'At least one move field is required: columnId, status, sprintId, or rank',
      );
    }
  }

  private toOptionalId(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'object' && '_id' in value) {
      return String(value._id);
    }

    return String(value);
  }
}
