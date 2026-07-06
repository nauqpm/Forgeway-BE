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
    actorId?: string,
  ): Promise<SprintDocument> {
    return this.sprintCommandService.createSprint(workspaceId, dto, actorId);
  }

  findByWorkspace(workspaceId: string): Promise<SprintDocument[]> {
    return this.sprintQueryService.findByWorkspace(workspaceId);
  }

  updateSprint(
    workspaceId: string,
    sprintId: string,
    dto: UpdateSprintDto,
    _actorId?: string,
  ): Promise<SprintDocument> {
    return this.sprintCommandService.updateSprint(workspaceId, sprintId, dto);
  }

  deleteSprint(
    workspaceId: string,
    sprintId: string,
    _actorId?: string,
  ): Promise<void> {
    return this.sprintCommandService.deleteSprint(workspaceId, sprintId);
  }

  startSprint(
    workspaceId: string,
    sprintId: string,
    dto: StartSprintDto,
    _actorId?: string,
  ): Promise<SprintDocument> {
    return this.sprintLifecycleService.startSprint(workspaceId, sprintId, dto);
  }

  completeSprint(
    workspaceId: string,
    sprintId: string,
    dto: CompleteSprintDto,
    _actorId?: string,
  ): Promise<unknown> {
    return this.sprintLifecycleService.completeSprint(
      workspaceId,
      sprintId,
      dto,
    );
  }

  getBacklog(workspaceId: string, grouped = false): Promise<unknown> {
    return this.backlogService.getBacklog(workspaceId, grouped);
  }

  getActiveSprint(
    workspaceId: string,
  ): Promise<(SprintDocument & { tasks?: TaskDocument[] }) | null> {
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
  ): Promise<unknown> {
    return this.sprintQueryService.getCompleteSprintPreview(
      workspaceId,
      sprintId,
    );
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

  findSprintById(sprintId: string): Promise<SprintDocument | null> {
    return this.sprintQueryService.findSprintById(sprintId);
  }

  findByIdInWorkspace(
    workspaceId: string,
    sprintId: string,
  ): Promise<SprintDocument> {
    return this.sprintQueryService.findByIdInWorkspace(workspaceId, sprintId);
  }

  // Backward-compatible alias for older callsites
  FindByIdInWorkspace(
    workspaceId: string,
    sprintId: string,
  ): Promise<SprintDocument> {
    return this.findByIdInWorkspace(workspaceId, sprintId);
  }

  async ensureSprintAssignable(
    workspaceId: string,
    sprintId: string,
  ): Promise<void> {
    const sprint = await this.findByIdInWorkspace(workspaceId, sprintId);

    if (sprint.status === 'completed') {
      throw new BadRequestException(
        'Completed sprints cannot receive new tasks',
      );
    }
  }

  getSprintVelocityReport(workspaceId: string): Promise<any[]> {
    return this.sprintQueryService.getSprintVelocityReport(workspaceId);
  }

  getCumulativeFlowReport(
    workspaceId: string,
    days?: number,
  ): Promise<{ statuses: string[]; data: any[] }> {
    return this.sprintQueryService.getCumulativeFlowReport(workspaceId, days);
  }

  deleteByWorkspace(workspaceId: string): Promise<void> {
    return this.sprintCommandService.deleteByWorkspace(workspaceId);
  }

  restoreByWorkspace(workspaceId: string): Promise<void> {
    return this.sprintCommandService.restoreByWorkspace(workspaceId);
  }
}
