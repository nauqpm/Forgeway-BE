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
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskRankRepository } from '../repositories/task-rank.repository';
import { TaskDocument } from '../schemas/task.schema';
import { compareRanks, generateRankBetween } from '../utils/rank.util';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';
import { TaskMoveAuditMetadata, TaskMoveResult } from './task-move.service';

interface RankUpdate {
  taskId: string;
  rank: string;
}

interface RankRebalanceResult {
  nextRank: string;
  rankUpdates: RankUpdate[];
}

@Injectable()
export class TaskReorderService {
  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskRankRepository: TaskRankRepository,
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
    this.ensureNeighborIdsAreValid(dto, taskId);

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

    const currentSprintId = this.toOptionalId(task.sprintId);
    const targetSprintId =
      dto.sprintId !== undefined ? dto.sprintId : (currentSprintId ?? null);

    if (targetSprintId && workspace.type !== 'scrum') {
      throw new BadRequestException(
        'Only Scrum tasks can be reordered into a sprint',
      );
    }

    const currentSprint = currentSprintId
      ? await this.scrumService.findByIdInWorkspace(
          workspaceId,
          currentSprintId,
        )
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
      dto.rankScope,
    );

    const [beforeTask, afterTask] = await Promise.all([
      dto.beforeTaskId
        ? this.taskRankRepository.findNeighborForReorder(
            dto.beforeTaskId,
            workspaceId,
            session,
          )
        : Promise.resolve(null),
      dto.afterTaskId
        ? this.taskRankRepository.findNeighborForReorder(
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

    const boundaryScopeTasks =
      !beforeTask || !afterTask
        ? await this.taskRankRepository.findTasksInRankScope(scope, session)
        : undefined;
    let nextRank = this.generateInitialRank(
      task,
      beforeTask,
      afterTask,
      boundaryScopeTasks,
    );
    let rankUpdates: RankUpdate[] = [];

    if (this.shouldRebalanceRanks(task, beforeTask, afterTask, nextRank)) {
      const rebalanceResult = await this.rebalanceRankScope(
        scope,
        task,
        beforeTask,
        afterTask,
        session,
      );
      nextRank = rebalanceResult.nextRank;
      rankUpdates = rebalanceResult.rankUpdates;
    }

    this.ensureRankWillChange(
      task,
      targetColumnId,
      targetStatus,
      targetSprintId,
      nextRank,
      rankUpdates.length,
    );

    if (rankUpdates.length > 0) {
      await this.taskRankRepository.updateRanksInWorkspace(
        workspaceId,
        rankUpdates,
        session,
      );
    }

    const reorderedTask = await this.taskRankRepository.reorderTaskInWorkspace(
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
    this.taskDomainEventPublisher.publishReordered(
      task,
      reorderedTask,
      userId,
      {
        beforeTaskId: dto.beforeTaskId ?? null,
        afterTaskId: dto.afterTaskId ?? null,
      },
    );

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

  private ensureNeighborIdsAreValid(dto: ReorderTaskDto, taskId: string): void {
    if (
      dto.beforeTaskId &&
      dto.afterTaskId &&
      dto.beforeTaskId === dto.afterTaskId
    ) {
      throw new BadRequestException(
        'beforeTaskId and afterTaskId must be different',
      );
    }

    if (dto.beforeTaskId === taskId) {
      throw new BadRequestException('beforeTaskId cannot be the moved task');
    }

    if (dto.afterTaskId === taskId) {
      throw new BadRequestException('afterTaskId cannot be the moved task');
    }
  }

  private generateInitialRank(
    task: TaskDocument,
    beforeTask: TaskDocument | null,
    afterTask: TaskDocument | null,
    scopeTasks?: TaskDocument[],
  ): string {
    if (
      beforeTask?.rank &&
      afterTask?.rank &&
      beforeTask.rank === afterTask.rank &&
      task.rank
    ) {
      return task.rank;
    }

    const boundaryRanks = this.resolveBoundaryRanks(
      task,
      beforeTask,
      afterTask,
      scopeTasks,
    );

    return generateRankBetween(
      boundaryRanks.beforeRank,
      boundaryRanks.afterRank,
    );
  }

  private resolveBoundaryRanks(
    task: TaskDocument,
    beforeTask: TaskDocument | null,
    afterTask: TaskDocument | null,
    scopeTasks?: TaskDocument[],
  ): { beforeRank?: string; afterRank?: string } {
    const beforeRank = beforeTask?.rank;
    const afterRank = afterTask?.rank;

    if (!scopeTasks?.length) {
      return { beforeRank, afterRank };
    }

    const taskId = task._id.toString();
    const rankedScopeTasks = scopeTasks
      .filter(
        scopeTask =>
          scopeTask._id.toString() !== taskId && Boolean(scopeTask.rank),
      )
      .sort((left, right) => this.compareTaskOrder(left, right));

    if (rankedScopeTasks.length === 0) {
      return { beforeRank, afterRank };
    }

    if (!beforeTask && afterTask) {
      return {
        beforeRank: undefined,
        afterRank:
          rankedScopeTasks[rankedScopeTasks.length - 1].rank ?? afterRank,
      };
    }

    if (beforeTask && !afterTask) {
      return {
        beforeRank: rankedScopeTasks[0].rank ?? beforeRank,
        afterRank: undefined,
      };
    }

    return { beforeRank, afterRank };
  }

  private shouldRebalanceRanks(
    task: TaskDocument,
    beforeTask: TaskDocument | null,
    afterTask: TaskDocument | null,
    nextRank: string,
  ): boolean {
    return (
      !task.rank ||
      Boolean(beforeTask && !beforeTask.rank) ||
      Boolean(afterTask && !afterTask.rank) ||
      Boolean(
        beforeTask?.rank &&
        afterTask?.rank &&
        beforeTask.rank === afterTask.rank,
      ) ||
      task.rank === nextRank
    );
  }

  private async rebalanceRankScope(
    scope: TaskReorderScope,
    task: TaskDocument,
    beforeTask: TaskDocument | null,
    afterTask: TaskDocument | null,
    session?: ClientSession,
  ): Promise<RankRebalanceResult> {
    const taskId = task._id.toString();
    const scopeTasks = await this.taskRankRepository.findTasksInRankScope(
      scope,
      session,
    );
    const orderedTasks = scopeTasks
      .filter(scopeTask => scopeTask._id.toString() !== taskId)
      .sort((left, right) => this.compareTaskOrder(left, right));
    const insertIndex = this.resolveInsertIndex(
      orderedTasks,
      beforeTask,
      afterTask,
    );
    const orderedTaskIds = orderedTasks.map(scopeTask => ({
      taskId: scopeTask._id.toString(),
      rank: scopeTask.rank,
    }));

    orderedTaskIds.splice(insertIndex, 0, {
      taskId,
      rank: task.rank,
    });

    let previousRank: string | undefined;
    const withNewRanks = orderedTaskIds.map(item => {
      const newRank = generateRankBetween(undefined, previousRank);
      previousRank = newRank;

      return {
        ...item,
        newRank,
      };
    });
    const movedIndex = withNewRanks.findIndex(item => item.taskId === taskId);
    const rankUpdates = withNewRanks
      .filter(item => item.taskId !== taskId && item.newRank !== item.rank)
      .map(({ taskId: id, newRank }) => ({ taskId: id, rank: newRank }));

    return {
      nextRank:
        withNewRanks[movedIndex]?.newRank ?? task.rank ?? generateRankBetween(),
      rankUpdates,
    };
  }

  private resolveInsertIndex(
    orderedTasks: TaskDocument[],
    beforeTask: TaskDocument | null,
    afterTask: TaskDocument | null,
  ): number {
    if (beforeTask) {
      const beforeIndex = orderedTasks.findIndex(
        task => task._id.toString() === beforeTask._id.toString(),
      );
      if (beforeIndex >= 0) {
        return beforeIndex;
      }
    }

    if (afterTask) {
      const afterIndex = orderedTasks.findIndex(
        task => task._id.toString() === afterTask._id.toString(),
      );
      if (afterIndex >= 0) {
        return afterIndex + 1;
      }
    }

    return orderedTasks.length;
  }

  private compareTaskOrder(left: TaskDocument, right: TaskDocument): number {
    const rankDiff = compareRanks(left.rank, right.rank);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return this.toTimestamp(left.createdAt) - this.toTimestamp(right.createdAt);
  }

  private toTimestamp(value: unknown): number {
    const timestamp = new Date(value as string | Date).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private ensureRankWillChange(
    task: TaskDocument,
    targetColumnId: string | undefined,
    targetStatus: string | undefined,
    targetSprintId: string | null,
    nextRank: string,
    rankUpdateCount: number,
  ): void {
    const currentSprintId = this.toOptionalId(task.sprintId) ?? null;
    const isSameColumn = task.columnId === targetColumnId;
    const isSameStatus = task.status === targetStatus;
    const isSameSprint = currentSprintId === targetSprintId;
    const isSameRank = task.rank === nextRank;
    const hasRebalancedNeighbors = rankUpdateCount > 0;

    if (
      isSameColumn &&
      isSameStatus &&
      isSameSprint &&
      isSameRank &&
      !hasRebalancedNeighbors
    ) {
      throw new BadRequestException(
        'Reorder did not change task position. Check beforeTaskId and afterTaskId.',
      );
    }
  }

  private resolveRankScope(
    workspaceType: string | undefined,
    workspaceId: string,
    columnId: string | undefined,
    sprintId: string | null,
    rankScope: 'board' | 'sprint' = 'board',
  ): TaskReorderScope {
    const isScrumSprintList =
      workspaceType === 'scrum' && rankScope === 'sprint';
    const isScrumBacklog = workspaceType === 'scrum' && sprintId === null;
    const shouldScopeByColumn = !isScrumSprintList && !isScrumBacklog;

    if (shouldScopeByColumn && !columnId) {
      throw new BadRequestException('columnId is required for board reorder');
    }

    return {
      workspaceId,
      ...(shouldScopeByColumn ? { columnId } : {}),
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
      return String(value._id);
    }

    return String(value);
  }
}
