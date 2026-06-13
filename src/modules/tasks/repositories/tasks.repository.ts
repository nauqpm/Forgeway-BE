import { Injectable } from '@nestjs/common';
import { TaskReadRepository } from './task-read.repository';
import { TaskRankRepository } from './task-rank.repository';
import { TaskWriteRepository } from './task-write.repository';

/**
 * @deprecated All consumers have been migrated to scoped repositories.
 * - Read operations → TaskReadRepository
 * - Write operations → TaskWriteRepository
 * - Rank operations → TaskRankRepository
 *
 * This class is kept as an empty provider for backward compatibility
 * in tasks.module.ts. Do not add new methods here — inject the
 * specific scoped repository directly.
 */
@Injectable()
export class TasksRepository {
  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskWriteRepository: TaskWriteRepository,
    private readonly taskRankRepository: TaskRankRepository,
  ) {}
}
