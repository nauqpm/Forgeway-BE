import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskCreationValidationService } from './task-creation-validation.service';

@Injectable()
export class TaskAccessService {
  constructor(
    private readonly validationService: TaskCreationValidationService,
    private readonly tasksRepository: TaskReadRepository,
  ) {}

  async getWorkspaceContext(
    workspaceKey: string,
    userId: string,
  ): Promise<{ workspace: any; workspaceId: string }> {
    const workspace =
      await this.validationService.getWorkspaceById(workspaceKey);
    const workspaceId = workspace._id.toString();
    await this.validationService.validateWorkspaceMember(workspaceId, userId);

    return { workspace, workspaceId };
  }

  async getWorkspaceContextById(
    workspaceId: string,
    userId: string,
  ): Promise<{ workspace: any; workspaceId: string }> {
    const workspace =
      await this.validationService.getWorkspaceById(workspaceId);
    await this.validationService.validateWorkspaceMember(workspaceId, userId);

    return { workspace, workspaceId };
  }

  async getTaskForWorkspace(
    taskId: string,
    workspaceId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<any> {
    this.validationService.validateObjectId(taskId, 'Task');

    const task = await this.tasksRepository.findByIdInWorkspace(
      taskId,
      workspaceId,
      options,
    );
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return task;
  }

  async getTaskForWorkspaceKey(
    taskKey: string,
    workspaceId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<any> {
    const task = await this.tasksRepository.findByWorkspaceAndKey(
      workspaceId,
      taskKey,
      options,
    );
    if (!task) {
      throw new NotFoundException(`Task with key ${taskKey} not found`);
    }

    return task;
  }

  getRequiredWorkspaceId(dto: { workspaceId?: string }): string {
    if (!dto.workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }

    return dto.workspaceId;
  }

  isObjectIdString(value: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(value);
  }

  toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  toTimestamp(value: unknown): number {
    const timestamp = new Date(value as string | Date).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  ensureScrumWorkspace(workspace: any): void {
    if (workspace.type !== 'scrum') {
      throw new BadRequestException(
        'This endpoint is only available for Scrum workspaces',
      );
    }
  }
}
