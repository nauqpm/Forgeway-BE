import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { FilterTaskDto } from '../dtos/requests/create-task.dto';
import { Task } from '../schemas/task.schema';
import { TaskDocument } from '../schemas/task.schema';
import { TaskReadRepository } from './task-read.repository';
import { TaskRankRepository } from './task-rank.repository';
import { TaskWriteRepository } from './task-write.repository';
import { MoveTaskData, TaskLookupOptions, TaskPaginatedResult, TaskPaginationOptions, TaskRankScope } from './task-repository.types';

/**
 * Facade repository that delegates to scoped repositories.
 * Kept for backward compatibility - consumers should inject the specific repository they need.
 */
@Injectable()
export class TasksRepository {
  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskWriteRepository: TaskWriteRepository,
    private readonly taskRankRepository: TaskRankRepository,
  ) {}

  // ─── Read ───────────────────────────────────────────────────────────────

  async create(data: Partial<Task>): Promise<TaskDocument> {
    return this.taskWriteRepository.create(data);
  }

  async findById(id: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findById(id, options);
  }

  async findByKey(key: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findByKey(key, options);
  }

  async findByIdInWorkspace(id: string, workspaceId: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findByIdInWorkspace(id, workspaceId, options);
  }

  async findByKeyInWorkspace(key: string, workspaceId: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findByKeyInWorkspace(key, workspaceId, options);
  }

  async findByWorkspaceAndKey(workspaceId: string, key: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findByWorkspaceAndKey(workspaceId, key, options);
  }

  async findDetailByIdInWorkspace(taskId: string, workspaceId: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findDetailByIdInWorkspace(taskId, workspaceId, options);
  }

  async findDetailByKeyInWorkspace(taskKey: string, workspaceId: string, options?: TaskLookupOptions): Promise<TaskDocument | null> {
    return this.taskReadRepository.findDetailByKeyInWorkspace(taskKey, workspaceId, options);
  }

  async findAll(filterDto: FilterTaskDto): Promise<TaskPaginatedResult> {
    return this.taskReadRepository.findAll(filterDto);
  }

  async findByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    return this.taskReadRepository.findByWorkspace(workspaceId);
  }

  async findArchivedByWorkspace(workspaceId: string, options?: TaskPaginationOptions): Promise<TaskPaginatedResult> {
    return this.taskReadRepository.findArchivedByWorkspace(workspaceId, options);
  }

  async findBacklogByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    return this.taskReadRepository.findBacklogByWorkspace(workspaceId);
  }

  async findBySprintInWorkspace(workspaceId: string, sprintId: string): Promise<TaskDocument[]> {
    return this.taskReadRepository.findBySprintInWorkspace(workspaceId, sprintId);
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    return this.taskReadRepository.countByWorkspace(workspaceId);
  }

  async findCalendarByWorkspace(workspaceId: string, startRange: Date, endRange: Date): Promise<TaskDocument[]> {
    return this.taskReadRepository.findCalendarByWorkspace(workspaceId, startRange, endRange);
  }

  async findTimelineByWorkspace(workspaceId: string): Promise<TaskDocument[]> {
    return this.taskReadRepository.findTimelineByWorkspace(workspaceId);
  }

  // ─── Write ──────────────────────────────────────────────────────────────

  async update(id: string, data: Partial<Task>): Promise<TaskDocument | null> {
    return this.taskWriteRepository.update(id, data);
  }

  async updateInWorkspace(id: string, workspaceId: string, data: Partial<Task>): Promise<TaskDocument | null> {
    return this.taskWriteRepository.updateInWorkspace(id, workspaceId, data);
  }

  async archive(id: string, archivedBy: string): Promise<TaskDocument | null> {
    return this.taskWriteRepository.archive(id, archivedBy);
  }

  async archiveInWorkspace(id: string, workspaceId: string, archivedBy: string): Promise<TaskDocument | null> {
    return this.taskWriteRepository.archiveInWorkspace(id, workspaceId, archivedBy);
  }

  async restore(id: string): Promise<TaskDocument | null> {
    return this.taskWriteRepository.restore(id);
  }

  async restoreInWorkspace(id: string, workspaceId: string): Promise<TaskDocument | null> {
    return this.taskWriteRepository.restoreInWorkspace(id, workspaceId);
  }

  async softDelete(id: string, deletedBy: string): Promise<TaskDocument | null> {
    return this.taskWriteRepository.softDelete(id, deletedBy);
  }

  async softDeleteInWorkspace(id: string, workspaceId: string, deletedBy: string): Promise<TaskDocument | null> {
    return this.taskWriteRepository.softDeleteInWorkspace(id, workspaceId, deletedBy);
  }

  // ─── Rank ───────────────────────────────────────────────────────────────

  async moveTaskInWorkspace(id: string, workspaceId: string, data: MoveTaskData, session?: ClientSession): Promise<TaskDocument | null> {
    return this.taskRankRepository.moveTaskInWorkspace(id, workspaceId, data, session);
  }

  async findNeighborForReorder(taskId: string, workspaceId: string, session?: ClientSession): Promise<TaskDocument | null> {
    return this.taskRankRepository.findNeighborForReorder(taskId, workspaceId, session);
  }

  async findTasksInRankScope(scope: TaskRankScope, session?: ClientSession): Promise<TaskDocument[]> {
    return this.taskRankRepository.findTasksInRankScope(scope, session);
  }

  async reorderTaskInWorkspace(id: string, workspaceId: string, data: MoveTaskData, session?: ClientSession): Promise<TaskDocument | null> {
    return this.taskRankRepository.reorderTaskInWorkspace(id, workspaceId, data, session);
  }

  async updateRanksInWorkspace(workspaceId: string, rankUpdates: Array<{ taskId: string; rank: string }>, session?: ClientSession): Promise<void> {
    return this.taskRankRepository.updateRanksInWorkspace(workspaceId, rankUpdates, session);
  }
}
