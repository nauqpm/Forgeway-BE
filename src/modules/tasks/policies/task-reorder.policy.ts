import { BadRequestException, Injectable } from '@nestjs/common';
import { SprintDocument } from '../../scrum/schemas/sprint.schema';
import { TaskDocument } from '../schemas/task.schema';

export interface TaskReorderScope {
  workspaceId: string;
  columnId?: string;
  sprintId?: string | null;
}

@Injectable()
export class TaskReorderPolicy {
  validateReorder(
    task: TaskDocument,
    scope: TaskReorderScope,
    beforeTask?: TaskDocument | null,
    afterTask?: TaskDocument | null,
    targetSprint?: SprintDocument | null,
    currentSprint?: SprintDocument | null,
  ): void {
    if (task.isArchived) {
      throw new BadRequestException('Archived task cannot be reordered');
    }

    if (task.isDeleted) {
      throw new BadRequestException('Deleted task cannot be reordered');
    }

    if (currentSprint?.status === 'completed') {
      throw new BadRequestException(
        'Task in a completed sprint cannot be reordered',
      );
    }

    if (targetSprint?.status === 'completed') {
      throw new BadRequestException(
        'Cannot reorder task into a completed sprint',
      );
    }

    if (
      beforeTask &&
      afterTask &&
      beforeTask._id.toString() === afterTask._id.toString()
    ) {
      throw new BadRequestException(
        'beforeTaskId and afterTaskId must be different',
      );
    }

    this.validateNeighbor(task, beforeTask, scope, 'beforeTaskId');
    this.validateNeighbor(task, afterTask, scope, 'afterTaskId');
  }

  private validateNeighbor(
    task: TaskDocument,
    neighbor: TaskDocument | null | undefined,
    scope: TaskReorderScope,
    fieldName: string,
  ): void {
    if (!neighbor) {
      return;
    }

    if (neighbor._id.toString() === task._id.toString()) {
      throw new BadRequestException(`${fieldName} cannot be the moved task`);
    }

    if (this.toOptionalId(neighbor.workspaceId) !== scope.workspaceId) {
      throw new BadRequestException(`${fieldName} is outside this workspace`);
    }

    if (neighbor.isArchived || neighbor.isDeleted) {
      throw new BadRequestException(`${fieldName} is not an active task`);
    }

    if (
      this.toOptionalId(neighbor.sprintId) !== (scope.sprintId ?? undefined)
    ) {
      throw new BadRequestException(
        `${fieldName} is outside target sprint scope`,
      );
    }

    if (scope.columnId && neighbor.columnId !== scope.columnId) {
      throw new BadRequestException(`${fieldName} is outside target column`);
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
