import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { ScrumService } from '../../scrum/services/scrum.service';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { ReorderTaskDto } from '../dtos/requests/reorder-task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import {
  TaskReorderPolicy,
  TaskReorderScope,
} from '../policies/task-reorder.policy';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskDocument } from '../schemas/task.schema';
import { generateRankBetween } from '../utils/rank.util';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';
import { TaskMoveAuditMetadata, TaskMoveResult } from './task-move.service';

@Injectable()
export class TaskReorderService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly validationService: TaskCreationValidationService,
    private readonly scrumService: ScrumService,
    private readonly taskReorderPolicy: TaskReorderPolicy,
    private readonly taskMapper: TaskMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
  ) {}

  async reorderInWorkspaceId(
    workspaceId: string,
    taskId: string,
    dto: ReorderTaskDto,
    userId: string,
    session?: ClientSession,
  ): Promise<TaskMoveResult> {
    this.ensureReorderHasMutation(dto);
    this.ensureNeighborIdsAreDifferent(dto);

    const workspace = await this.validationService.getWorkspaceById(workspaceId);
    await this.validationService.validateWorkspaceMember(workspaceId, userId);
    this.validationService.validateObjectId(taskId, 'Task');

    const task = await this.tasksRepository.findByIdInWorkspace(
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

    const currentSprintId = this.toOptionalId(task.sprintId);
    const targetSprintId =
      dto.sprintId !== undefined ? dto.sprintId : currentSprintId ?? null;

    if (targetSprintId && workspace.type !== 'scrum') {
      throw new BadRequestException(
        'Only Scrum tasks can be reordered into a sprint',
      );
    }

    const currentSprint = currentSprintId
      ? await this.scrumService.findByIdInWorkspace(workspaceId, currentSprintId)
      : null;
    const targetSprint = targetSprintId
      ? await this.scrumService.findByIdInWorkspace(workspaceId, targetSprintId)
      : null;

    const targetColumnId = dto.columnId ?? task.columnId;
    const targetStatus = dto.status ?? task.status;
    const scope = this.resolveRankScope(
      workspace.type,
      workspaceId,
      targetColumnId,
      targetSprintId,
    );

    const [beforeTask, afterTask] = await Promise.all([
      dto.beforeTaskId
        ? this.tasksRepository.findNeighborForReorder(
            dto.beforeTaskId,
            workspaceId,
            session,
          )
        : Promise.resolve(null),
      dto.afterTaskId
        ? this.tasksRepository.findNeighborForReorder(
            dto.afterTaskId,
            workspaceId,
            session,
          )
        : Promise.resolve(null),
    ]);

    this.assertNeighborExists(dto.beforeTaskId, beforeTask, 'beforeTaskId');
    this.assertNeighborExists(dto.afterTaskId, afterTask, 'afterTaskId');
    this.taskReorderPolicy.validateReorder(
      task,
      scope,
      beforeTask,
      afterTask,
      targetSprint,
      currentSprint,
    );

    const nextRank = generateRankBetween(beforeTask?.rank, afterTask?.rank);
    this.ensureRankWillChange(task, dto, targetColumnId, targetStatus, targetSprintId, nextRank);
    const reorderedTask = await this.tasksRepository.reorderTaskInWorkspace(
      taskId,
      workspaceId,
      {
        columnId: targetColumnId,
        status: targetStatus,
        sprintId: workspace.type === 'scrum' ? targetSprintId : undefined,
        rank: nextRank,
      },
      session,
    );

    if (!reorderedTask) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskMoved(
      task,
      reorderedTask,
      userId,
    );
    this.taskDomainEventPublisher.publishReordered(task, reorderedTask, userId, {
      beforeTaskId: dto.beforeTaskId ?? null,
      afterTaskId: dto.afterTaskId ?? null,
    });

    return {
      task: this.taskMapper.mapToDto(reorderedTask),
      auditMetadata: this.buildAuditMetadata(
        taskId,
        task,
        reorderedTask,
        dto,
        nextRank,
      ),
    };
  }

  private ensureReorderHasMutation(dto: ReorderTaskDto): void {
    const hasMutation =
      dto.columnId !== undefined ||
      dto.status !== undefined ||
      dto.sprintId !== undefined ||
      dto.beforeTaskId !== undefined ||
      dto.afterTaskId !== undefined;

    if (!hasMutation) {
      throw new BadRequestException(
        'At least one reorder field is required: columnId, status, sprintId, beforeTaskId, or afterTaskId',
      );
    }
  }

  private ensureNeighborIdsAreDifferent(dto: ReorderTaskDto): void {
    if (
      dto.beforeTaskId &&
      dto.afterTaskId &&
      dto.beforeTaskId === dto.afterTaskId
    ) {
      throw new BadRequestException(
        'beforeTaskId and afterTaskId must be different',
      );
    }
  }

  private ensureRankWillChange(
    task: TaskDocument,
    dto: ReorderTaskDto,
    targetColumnId: string | undefined,
    targetStatus: string | undefined,
    targetSprintId: string | null,
    nextRank: string,
  ): void {
    const currentSprintId = this.toOptionalId(task.sprintId) ?? null;
    const isSameColumn = task.columnId === targetColumnId;
    const isSameStatus = task.status === targetStatus;
    const isSameSprint = currentSprintId === targetSprintId;
    const isSameRank = task.rank === nextRank;

    if (isSameColumn && isSameStatus && isSameSprint && isSameRank) {
      throw new BadRequestException(
        'Reorder did not change task position. Check beforeTaskId and afterTaskId.',
      );
    }

    if (dto.beforeTaskId && dto.beforeTaskId === task._id.toString()) {
      throw new BadRequestException('beforeTaskId cannot be the moved task');
    }

    if (dto.afterTaskId && dto.afterTaskId === task._id.toString()) {
      throw new BadRequestException('afterTaskId cannot be the moved task');
    }
  }

  private resolveRankScope(
    workspaceType: string | undefined,
    workspaceId: string,
    columnId: string | undefined,
    sprintId: string | null,
  ): TaskReorderScope {
    const isScrumBacklog = workspaceType === 'scrum' && sprintId === null;
    if (!isScrumBacklog && !columnId) {
      throw new BadRequestException('columnId is required for board reorder');
    }

    return {
      workspaceId,
      ...(isScrumBacklog ? {} : { columnId }),
      ...(workspaceType === 'scrum' ? { sprintId } : {}),
    };
  }

  private assertNeighborExists(
    requestedId: string | undefined,
    neighbor: TaskDocument | null,
    fieldName: string,
  ): void {
    if (requestedId && !neighbor) {
      throw new NotFoundException(`${fieldName} ${requestedId} not found`);
    }
  }

  private buildAuditMetadata(
    taskId: string,
    before: TaskDocument,
    after: TaskDocument,
    dto: ReorderTaskDto,
    nextRank: string,
  ): TaskMoveAuditMetadata & {
    beforeTaskId?: string;
    afterTaskId?: string;
  } {
    return {
      taskId,
      taskKey: before.key,
      fromColumn: before.columnId,
      toColumn: after.columnId,
      fromStatus: before.status,
      toStatus: after.status,
      fromSprint: this.toOptionalId(before.sprintId) ?? null,
      toSprint: this.toOptionalId(after.sprintId) ?? null,
      fromRank: before.rank,
      toRank: nextRank,
      beforeTaskId: dto.beforeTaskId,
      afterTaskId: dto.afterTaskId,
    };
  }

  private toOptionalId(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'object' && '_id' in value) {
      return String((value as { _id: unknown })._id);
    }

    return String(value);
  }
}
