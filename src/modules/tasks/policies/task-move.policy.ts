import { BadRequestException, Injectable } from '@nestjs/common';
import { SprintDocument } from '../../scrum/schemas/sprint.schema';
import { TaskDocument } from '../schemas/task.schema';

@Injectable()
export class TaskMovePolicy {
  validateMove(
    task: TaskDocument,
    targetSprint?: SprintDocument | null,
    currentSprint?: SprintDocument | null,
  ): void {
    if (task.isArchived) {
      throw new BadRequestException('Archived task cannot be moved');
    }

    if (task.isDeleted) {
      throw new BadRequestException('Deleted task cannot be moved');
    }

    if (currentSprint?.status === 'completed') {
      throw new BadRequestException(
        'Task in a completed sprint cannot be moved',
      );
    }

    if (targetSprint?.status === 'completed') {
      throw new BadRequestException('Cannot move task into a completed sprint');
    }
  }
}
