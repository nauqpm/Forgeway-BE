import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskDocument } from '../../tasks/schemas/task.schema';

@Injectable()
export class TaskCoverPolicy {
  assertCanModify(task: TaskDocument): void {
    if (task.isDeleted) {
      throw new BadRequestException('Deleted task cover cannot be modified');
    }

    if (task.isArchived) {
      throw new BadRequestException('Archived task cover is read-only');
    }
  }
}
