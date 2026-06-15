import {
  Inject,
  Injectable,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { BoardColumn } from '../../kanban/schemas/kanban-board.schema';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { FilterTaskDto } from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskAccessService } from './task-access.service';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { ErrorFactory } from '../../../common/factories/error.factory';

@Injectable()
export class TaskQueryService {
  constructor(
    private readonly tasksRepository: TaskReadRepository,
    private readonly taskMapper: TaskMapper,
    private readonly validationService: TaskCreationValidationService,
    private readonly taskAccessService: TaskAccessService,
    private readonly kanbanService: KanbanService,
    @Inject(forwardRef(() => ScrumService))
    private readonly scrumService: ScrumService,
  ) {}

  async findAll(
    filterDto: FilterTaskDto,
    currentUserId?: string,
  ): Promise<TaskListDto> {
    if (filterDto.workspaceId && currentUserId) {
      await this.validationService.validateWorkspaceMember(
        filterDto.workspaceId,
        currentUserId,
      );
    }

    const result = await this.tasksRepository.findAll(filterDto);
    return {
      tasks: this.taskMapper.mapToDtos(result.tasks),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findByWorkspace(
    workspaceId: string,
    currentUserId?: string,
  ): Promise<TaskDto[]> {
    this.validationService.validateObjectId(workspaceId, 'Workspace');
    if (currentUserId) {
      await this.validationService.validateWorkspaceMember(
        workspaceId,
        currentUserId,
      );
    }

    const tasks = await this.tasksRepository.findByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findByWorkspaceKey(
    workspaceKey: string,
    currentUserId?: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    const workspace =
      await this.validationService.getWorkspaceById(workspaceKey);
    return this.findByWorkspaceId(
      workspace._id.toString(),
      currentUserId,
      filterDto,
    );
  }

  async findByWorkspaceId(
    workspaceId: string,
    currentUserId?: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    this.validationService.validateObjectId(workspaceId, 'Workspace');

    if (currentUserId) {
      await this.validationService.validateWorkspaceMember(
        workspaceId,
        currentUserId,
      );
    }

    const result = await this.tasksRepository.findAll({
      ...filterDto,
      workspaceId,
    });

    return {
      tasks: this.taskMapper.mapToDtos(result.tasks),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findArchivedByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    const workspace =
      await this.validationService.getWorkspaceById(workspaceKey);
    return this.findArchivedByWorkspaceId(
      workspace._id.toString(),
      currentUserId,
      filterDto,
    );
  }

  async findArchivedByWorkspaceId(
    workspaceId: string,
    currentUserId: string,
    filterDto: Omit<FilterTaskDto, 'workspaceId'> = {},
  ): Promise<TaskListDto> {
    this.validationService.validateObjectId(workspaceId, 'Workspace');
    await this.validationService.validateWorkspaceMember(
      workspaceId,
      currentUserId,
    );

    const result = await this.tasksRepository.findArchivedByWorkspace(
      workspaceId,
      filterDto,
    );
    const tasks = this.taskMapper.mapToDtos(result.tasks);
    return {
      tasks: await this.applyArchivedColumnNames(workspaceId, tasks),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findBacklogByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace, workspaceId } =
      await this.taskAccessService.getWorkspaceContext(
        workspaceKey,
        currentUserId,
      );
    this.taskAccessService.ensureScrumWorkspace(workspace);

    const tasks =
      await this.tasksRepository.findBacklogByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findBacklogByWorkspaceId(
    workspaceId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace } = await this.taskAccessService.getWorkspaceContextById(
      workspaceId,
      currentUserId,
    );
    this.taskAccessService.ensureScrumWorkspace(workspace);

    const tasks =
      await this.tasksRepository.findBacklogByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findActiveSprintBoardByWorkspaceKey(
    workspaceKey: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace, workspaceId } =
      await this.taskAccessService.getWorkspaceContext(
        workspaceKey,
        currentUserId,
      );
    this.taskAccessService.ensureScrumWorkspace(workspace);

    const activeSprint = await this.scrumService.getActiveSprint(workspaceId);
    if (!activeSprint) {
      return [];
    }

    const tasks = await this.tasksRepository.findBySprintInWorkspace(
      workspaceId,
      activeSprint._id.toString(),
    );
    return this.taskMapper.mapToDtos(tasks);
  }

  async findActiveSprintBoardByWorkspaceId(
    workspaceId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace } = await this.taskAccessService.getWorkspaceContextById(
      workspaceId,
      currentUserId,
    );
    this.taskAccessService.ensureScrumWorkspace(workspace);

    const activeSprint = await this.scrumService.getActiveSprint(workspaceId);
    if (!activeSprint) {
      return [];
    }

    const tasks = await this.tasksRepository.findBySprintInWorkspace(
      workspaceId,
      activeSprint._id.toString(),
    );
    return this.taskMapper.mapToDtos(tasks);
  }

  async findTasksBySprintInWorkspaceKey(
    workspaceKey: string,
    sprintId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace, workspaceId } =
      await this.taskAccessService.getWorkspaceContext(
        workspaceKey,
        currentUserId,
      );
    this.taskAccessService.ensureScrumWorkspace(workspace);
    await this.scrumService.findByIdInWorkspace(workspaceId, sprintId);

    const tasks = await this.tasksRepository.findBySprintInWorkspace(
      workspaceId,
      sprintId,
    );
    return this.taskMapper.mapToDtos(tasks);
  }

  async findTasksBySprintInWorkspaceId(
    workspaceId: string,
    sprintId: string,
    currentUserId: string,
  ): Promise<TaskDto[]> {
    const { workspace } = await this.taskAccessService.getWorkspaceContextById(
      workspaceId,
      currentUserId,
    );
    this.taskAccessService.ensureScrumWorkspace(workspace);
    await this.scrumService.findByIdInWorkspace(workspaceId, sprintId);

    const tasks = await this.tasksRepository.findBySprintInWorkspace(
      workspaceId,
      sprintId,
    );
    return this.taskMapper.mapToDtos(tasks);
  }

  async findById(id: string): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');

    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(ErrorFactory.taskNotFound(id));
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByIdInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    const task = await this.taskAccessService.getTaskForWorkspace(
      taskId,
      workspaceId,
    );

    return this.taskMapper.mapToDto(task);
  }

  async findByIdInWorkspaceId(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDto> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);
    const task = await this.taskAccessService.getTaskForWorkspace(
      taskId,
      workspaceId,
    );

    return this.taskMapper.mapToDto(task);
  }

  async findByIdForAccessCheck(id: string): Promise<TaskDto> {
    this.validationService.validateObjectId(id, 'Task');

    const task = await this.tasksRepository.findById(id, {
      includeArchived: true,
    });
    if (!task) {
      throw new NotFoundException(ErrorFactory.taskNotFound(id));
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByKey(key: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findByKey(key);
    if (!task) {
      throw new NotFoundException(ErrorFactory.taskNotFound(key));
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByKeyInWorkspaceKey(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    const { workspaceId } = await this.taskAccessService.getWorkspaceContext(
      workspaceKey,
      userId,
    );
    const task = await this.taskAccessService.getTaskForWorkspaceKey(
      taskKey,
      workspaceId,
    );

    return this.taskMapper.mapToDto(task);
  }

  async findByKeyInWorkspace(
    workspaceKey: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    return this.findByKeyInWorkspaceKey(workspaceKey, taskKey, userId);
  }

  async findByKeyInWorkspaceId(
    workspaceId: string,
    taskKey: string,
    userId: string,
  ): Promise<TaskDto> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);
    const task = await this.taskAccessService.getTaskForWorkspaceKey(
      taskKey,
      workspaceId,
    );

    return this.taskMapper.mapToDto(task);
  }

  async findCalendarByWorkspaceId(
    workspaceId: string,
    year: number,
    month: number,
    userId: string,
  ): Promise<{ tasks: TaskDto[] }> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const startBuffer = new Date(startOfMonth);
    startBuffer.setDate(startBuffer.getDate() - 7);
    const endBuffer = new Date(endOfMonth);
    endBuffer.setDate(endBuffer.getDate() + 7);

    const tasks = await this.tasksRepository.findCalendarByWorkspace(
      workspaceId,
      startBuffer,
      endBuffer,
    );
    return { tasks: this.taskMapper.mapToDtos(tasks) };
  }

  async findTimelineHierarchyByWorkspaceId(
    workspaceId: string,
    userId: string,
  ): Promise<{
    epics: TaskDto[];
    children: TaskDto[];
    standalones: TaskDto[];
  }> {
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const allTasks =
      await this.tasksRepository.findTimelineByWorkspace(workspaceId);
    const dtos = this.taskMapper.mapToDtos(allTasks);

    const epics = dtos.filter(t => t.type === 'epic');
    const epicIdSet = new Set(epics.map(e => e.id));

    const children = dtos.filter(
      t => (t as any).epicId && epicIdSet.has((t as any).epicId),
    );
    const standalones = dtos.filter(
      t => t.type !== 'epic' && !(t as any).epicId,
    );

    return { epics, children, standalones };
  }

  private async applyArchivedColumnNames(
    workspaceId: string,
    tasks: TaskDto[],
  ): Promise<TaskDto[]> {
    if (tasks.length === 0) {
      return tasks;
    }

    const boards = await this.kanbanService.findByWorkspaceId(workspaceId);
    const columnsById = new Map<string, BoardColumn>();

    boards.forEach(board => {
      (board.columns || []).forEach(column => {
        columnsById.set(column.id, column);
      });
    });

    return tasks.map(task => {
      const column = task.columnId ? columnsById.get(task.columnId) : undefined;

      return column
        ? {
            ...task,
            status: column.name,
          }
        : task;
    });
  }
}
