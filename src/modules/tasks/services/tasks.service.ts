import { Injectable } from '@nestjs/common';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskCreateService } from './task-create.service';
import { TaskLifecycleService } from './task-lifecycle.service';
import { TaskQueryService } from './task-query.service';
import { TaskUpdateService } from './task-update.service';

/**
 * Facade service that delegates to application services.
 * Kept for backward compatibility - consumers should inject the specific service they need.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly taskCreateService: TaskCreateService,
    private readonly taskQueryService: TaskQueryService,
    private readonly taskUpdateService: TaskUpdateService,
    private readonly taskLifecycleService: TaskLifecycleService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskDto> {
    return this.taskCreateService.create(createTaskDto, userId);
  }

  async createInWorkspaceKey(
    workspaceKey: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskCreateService.createInWorkspaceKey(
      workspaceKey,
      createTaskDto,
      userId,
    );
  }

  async createInWorkspaceId(
    workspaceId: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskCreateService.createInWorkspaceId(
      workspaceId,
      createTaskDto,
      userId,
    );
  }

  // ─── Query / Read ─────────────────────────────────────────────────────────

  async findAll(
    filterDto: FilterTaskDto,
    currentUserId?: string,
  ): Promise<TaskListDto> {
    return this.taskQueryService.findAll(filterDto, currentUserId);
  }

  async findByWorkspace(
    workspaceId: string,
    currentUserId?: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findByWorkspace(workspaceId, currentUserId);
  }

  async findByWorkspaceKey(
    workspaceKey: string,
    currentUserId?: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    return this.taskQueryService.findByWorkspaceKey(
      workspaceKey,
      currentUserId,
      filterDto,
    );
  }

  async findByWorkspaceId(
    workspaceId: string,
    currentUserId?: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    return this.taskQueryService.findByWorkspaceId(
      workspaceId,
      currentUserId,
      filterDto,
    );
  }

  async findArchivedByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    return this.taskQueryService.findArchivedByWorkspaceKey(
      workspaceKey,
      currentUserId,
      filterDto,
    );
  }

  async findArchivedByWorkspaceId(
    workspaceId: string,
    currentUserId: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    return this.taskQueryService.findArchivedByWorkspaceId(
      workspaceId,
      currentUserId,
      filterDto,
    );
  }

  async findBacklogByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findBacklogByWorkspaceKey(
      workspaceKey,
      currentUserId,
    );
  }

  async findBacklogByWorkspaceId(
    workspaceId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findBacklogByWorkspaceId(
      workspaceId,
      currentUserId,
    );
  }

  async findActiveSprintBoardByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findActiveSprintBoardByWorkspaceKey(
      workspaceKey,
      currentUserId,
    );
  }

  async findActiveSprintBoardByWorkspaceId(
    workspaceId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findActiveSprintBoardByWorkspaceId(
      workspaceId,
      currentUserId,
    );
  }

  async findTasksBySprintInWorkspaceKey(
    workspaceKey: string,
    sprintId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findTasksBySprintInWorkspaceKey(
      workspaceKey,
      sprintId,
      currentUserId,
    );
  }

  async findTasksBySprintInWorkspaceId(
    workspaceId: string,
    sprintId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    return this.taskQueryService.findTasksBySprintInWorkspaceId(
      workspaceId,
      sprintId,
      currentUserId,
    );
  }

  async findById(id: string): Promise<TaskDto> {
    return this.taskQueryService.findById(id);
  }

  async findByIdInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskQueryService.findByIdInWorkspaceKey(
      workspaceKey,
      taskId,
      userId,
    );
  }

  async findByIdInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskQueryService.findByIdInWorkspaceId(
      workspaceId,
      taskId,
      userId,
    );
  }

  async findByIdForAccessCheck(id: string): Promise<TaskDto> {
    return this.taskQueryService.findByIdForAccessCheck(id);
  }

  async findByKey(key: string): Promise<TaskDto> {
    return this.taskQueryService.findByKey(key);
  }

  async findByKeyInWorkspaceKey(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskQueryService.findByKeyInWorkspaceKey(
      workspaceKey,
      taskKey,
      userId,
    );
  }

  async findByKeyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskQueryService.findByKeyInWorkspace(
      workspaceKey,
      taskKey,
      userId,
    );
  }

  async findByKeyInWorkspaceId(
    workspaceId: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskQueryService.findByKeyInWorkspaceId(
      workspaceId,
      taskKey,
      userId,
    );
  }

  async findCalendarByWorkspaceId(
    workspaceId: string,
    year: number,
    month: number,
    userId: string,
  ): Promise<{ tasks: TaskDto[] }> {
    return this.taskQueryService.findCalendarByWorkspaceId(
      workspaceId,
      year,
      month,
      userId,
    );
  }

  async findTimelineHierarchyByWorkspaceId(
    workspaceId: string,
    userId: string,
  ): Promise<{
    epics: TaskDto[];
    children: TaskDto[];
    standalones: TaskDto[];
  }> {
    return this.taskQueryService.findTimelineHierarchyByWorkspaceId(
      workspaceId,
      userId,
    );
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    return this.taskUpdateService.update(id, updateTaskDto);
  }

  async updateInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskUpdateService.updateInWorkspaceKey(
      workspaceKey,
      taskId,
      updateTaskDto,
      userId,
    );
  }

  async updateInWorkspaceId(
    workspaceId: string,
    taskId: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
    userRole?: string,
  ): Promise<TaskDto> {
    return this.taskUpdateService.updateInWorkspaceId(
      workspaceId,
      taskId,
      updateTaskDto,
      userId,
      userRole,
    );
  }

  // ─── Lifecycle (archive / restore / delete) ────────────────────────────────

  async archiveInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.archiveInWorkspaceKey(
      workspaceKey,
      taskId,
      userId,
    );
  }

  async archiveTaskKeyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.archiveTaskKeyInWorkspace(
      workspaceKey,
      taskKey,
      userId,
    );
  }

  async archiveInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.archiveInWorkspaceId(
      workspaceId,
      taskId,
      userId,
    );
  }

  async restoreInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.restoreInWorkspaceKey(
      workspaceKey,
      taskId,
      userId,
    );
  }

  async restoreTaskKeyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.restoreTaskKeyInWorkspace(
      workspaceKey,
      taskKey,
      userId,
    );
  }

  async restoreInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.restoreInWorkspaceId(
      workspaceId,
      taskId,
      userId,
    );
  }

  async deletePermanentlyInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.deletePermanentlyInWorkspaceKey(
      workspaceKey,
      taskId,
      userId,
      confirmText,
    );
  }

  async deleteTaskKeyPermanentlyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.deleteTaskKeyPermanentlyInWorkspace(
      workspaceKey,
      taskKey,
      userId,
      confirmText,
    );
  }

  async deletePermanentlyInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
    confirmText?: string,
  ): Promise<TaskDto> {
    return this.taskLifecycleService.deletePermanentlyInWorkspaceId(
      workspaceId,
      taskId,
      userId,
      confirmText,
    );
  }
}
