import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskDetailDto } from '../dtos/responses/task-detail.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { normalizeTaskKey } from '../utils/task-key.util';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDocument } from '../schemas/task.schema';
import { WorkflowsService } from '../../workflows/services/workflows.service';

@Injectable()
export class TaskDetailService {
  constructor(
    private readonly tasksRepository: TaskReadRepository,
    private readonly taskMapper: TaskMapper,
    private readonly validationService: TaskCreationValidationService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async getDetailByIdInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDetailDto> {
    const workspaceId = await this.resolveWorkspaceId(workspaceKey, userId);
    this.validationService.validateObjectId(taskId, 'Task');

    const task = await this.tasksRepository.findDetailByIdInWorkspace(
      taskId,
      workspaceId,
      { includeArchived: true },
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const dto = this.taskMapper.mapToDetailDto(task);
    return this.enrichWithSubtasks(task, dto, workspaceId);
  }

  async getDetailByKeyInWorkspaceKey(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDetailDto> {
    const workspaceId = await this.resolveWorkspaceId(workspaceKey, userId);
    const normalizedTaskKey = normalizeTaskKey(taskKey);
    if (!normalizedTaskKey) {
      throw new NotFoundException(`Task with key ${taskKey} not found`);
    }

    const task = await this.tasksRepository.findDetailByKeyInWorkspace(
      normalizedTaskKey,
      workspaceId,
      {
        includeArchived: true,
      },
    );
    if (!task) {
      throw new NotFoundException(`Task with key ${taskKey} not found`);
    }

    const dto = this.taskMapper.mapToDetailDto(task);
    return this.enrichWithSubtasks(task, dto, workspaceId);
  }

  private async resolveWorkspaceId(
    workspaceKey: string,
    userId: string,
  ): Promise<string> {
    const workspace =
      await this.validationService.getWorkspaceById(workspaceKey);
    const workspaceId = workspace._id.toString();
    await this.validationService.validateWorkspaceMember(workspaceId, userId);

    return workspaceId;
  }

  private async enrichWithSubtasks(
    task: TaskDocument,
    dto: TaskDetailDto,
    workspaceId: string,
  ): Promise<TaskDetailDto> {
    // Chỉ load subtasks cho task cha (không phải subtask type)
    if (task.type === 'subtask') {
      return dto;
    }

    const taskId = task._id.toString();
    const doneStatusIds =
      await this.workflowsService.getDoneStatusIds(workspaceId);

    const [subtasks, total, done] = await Promise.all([
      this.tasksRepository.findSubtasksByParentId(taskId, workspaceId),
      this.tasksRepository.countSubtasksByParentId(taskId),
      this.tasksRepository.countDoneSubtasksByParentId(taskId, doneStatusIds),
    ]);

    return {
      ...dto,
      subtasks: this.taskMapper.mapSubtaskSummaries(subtasks),
      subtaskProgress: { done, total },
    };
  }
}
