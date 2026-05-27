import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskDocument } from '../../tasks/schemas/task.schema';
import {
  CompleteSprintDto,
  CreateSprintDto,
  StartSprintDto,
  UpdateSprintDto,
} from '../dtos/sprint.dto';
import { SprintDocument } from '../schemas/sprint.schema';
import { BacklogService } from './backlog.service';
import { SprintCommandService } from './sprint-command.service';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { SprintQueryService } from './sprint-query.service';
import { SprintTaskMovementService } from './sprint-task-movement.service';

@Injectable()
export class ScrumService {
  constructor(
    private readonly sprintCommandService: SprintCommandService,
    private readonly sprintQueryService: SprintQueryService,
    private readonly sprintLifecycleService: SprintLifecycleService,
    private readonly sprintTaskMovementService: SprintTaskMovementService,
    private readonly backlogService: BacklogService,
  ) {}

  createSprint(
    workspaceId: string,
    dto: CreateSprintDto,
  ): Promise<SprintDocument> {
    return this.sprintCommandService.createSprint(workspaceId, dto);
  }

  findByWorkspace(workspaceId: string): Promise<SprintDocument[]> {
    return this.sprintQueryService.findByWorkspace(workspaceId);
  }

  findByIdInWorkspace(
    workspaceId: string,
    sprintId: string,
  ): Promise<SprintDocument> {
    return this.sprintQueryService.findByIdInWorkspace(workspaceId, sprintId);
  }

  async ensureSprintAssignable(
    workspaceId: string,
    sprintId: string,
  ): Promise<SprintDocument> {
    const sprint = await this.findByIdInWorkspace(workspaceId, sprintId);

    if (sprint.status === 'completed') {
      throw new BadRequestException('Cannot assign task to a completed sprint');
    }

    return sprint;
  }

  startSprint(
    workspaceId: string,
    sprintId: string,
    dto: StartSprintDto,
  ): Promise<SprintDocument> {
    return this.sprintLifecycleService.startSprint(workspaceId, sprintId, dto);
  }

  completeSprint(
    workspaceId: string,
    sprintId: string,
    dto: CompleteSprintDto,
  ): Promise<any> {
    return this.sprintLifecycleService.completeSprint(
      workspaceId,
      sprintId,
      dto,
    );
  }

  getBacklog(workspaceId: string, grouped = false): Promise<any> {
    return this.backlogService.getBacklog(workspaceId, grouped);
  }

  updateSprint(
    workspaceId: string,
    sprintId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintDocument> {
    return this.sprintCommandService.updateSprint(workspaceId, sprintId, dto);
  }

  deleteSprint(workspaceId: string, sprintId: string): Promise<void> {
    return this.sprintCommandService.deleteSprint(workspaceId, sprintId);
  }

  moveTasksToSprint(
    workspaceId: string,
    sprintId: string,
    taskIds: string[],
    isSuperAdmin = false,
  ): Promise<{ modifiedCount: number }> {
    return this.sprintTaskMovementService.moveTasksToSprint(
      workspaceId,
      sprintId,
      taskIds,
      isSuperAdmin,
    );
  }

  moveTasksToBacklog(
    workspaceId: string,
    taskIds: string[],
    isSuperAdmin = false,
  ): Promise<{ modifiedCount: number }> {
    return this.sprintTaskMovementService.moveTasksToBacklog(
      workspaceId,
      taskIds,
      isSuperAdmin,
    );
  }

  getActiveSprint(workspaceId: string): Promise<any | null> {
    return this.sprintQueryService.getActiveSprint(workspaceId);
  }

  getSprintTasks(
    workspaceId: string,
    sprintId: string,
  ): Promise<TaskDocument[]> {
    return this.sprintQueryService.getSprintTasks(workspaceId, sprintId);
  }

  getCompleteSprintPreview(
    workspaceId: string,
    sprintId: string,
  ): Promise<any> {
    return this.sprintQueryService.getCompleteSprintPreview(
      workspaceId,
      sprintId,
    );
  }

  findSprintById(sprintId: string): Promise<SprintDocument | null> {
    return this.sprintQueryService.findSprintById(sprintId);
  }

  deleteByWorkspace(workspaceId: string): Promise<void> {
    return this.sprintCommandService.deleteByWorkspace(workspaceId);
  }
}
