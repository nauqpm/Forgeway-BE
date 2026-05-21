import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskKeyService } from './task-key.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
    private readonly workspacesService: WorkspacesService,
    private readonly kanbanService: KanbanService,
    private readonly scrumService: ScrumService,
    private readonly usersService: UsersService,
    private readonly taskKeyService: TaskKeyService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskDto> {
    const workspaceId = createTaskDto.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }
    this.validateObjectId(workspaceId, 'Workspace');

    const workspace = await this.workspacesService.findById(workspaceId);
    await this.ensureWorkspaceMember(workspaceId, userId);

    const normalizedDto =
      workspace.type === 'kanban'
        ? await this.normalizeKanbanTask(createTaskDto, workspaceId)
        : await this.normalizeScrumTask(createTaskDto, workspaceId);

    if (normalizedDto.assigneeId) {
      await this.validateAssignee(normalizedDto.assigneeId, workspaceId);
    }

    const taskNumber =
      (await this.tasksRepository.countByWorkspace(workspaceId)) + 1;
    const key = this.taskKeyService.create(
      workspace.key || workspace.name,
      taskNumber,
    );

    const task = await this.tasksRepository.create({
      title: normalizedDto.title,
      description: normalizedDto.description,
      workspaceId: new Types.ObjectId(workspaceId),
      sprintId: normalizedDto.sprintId
        ? new Types.ObjectId(normalizedDto.sprintId)
        : undefined,
      boardId: normalizedDto.boardId
        ? new Types.ObjectId(normalizedDto.boardId)
        : undefined,
      columnId:
        normalizedDto.columnId ||
        normalizedDto.boardColumnId ||
        normalizedDto.status ||
        'todo',
      key,
      type: normalizedDto.type || 'task',
      priority: normalizedDto.priority || 'medium',
      assigneeId: normalizedDto.assigneeId
        ? new Types.ObjectId(normalizedDto.assigneeId)
        : undefined,
      reporterId: new Types.ObjectId(userId),
      storyPoints: normalizedDto.storyPoints,
      dueDate: normalizedDto.dueDate
        ? new Date(normalizedDto.dueDate)
        : undefined,
    });

    this.logger.log(`Task created: ${key} in workspace ${workspaceId}`);
    return this.taskMapper.mapToDto(task);
  }

  async createInWorkspaceKey(
    workspaceKey: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    const workspace = await this.workspacesService.findByKey(workspaceKey);
    return this.create(
      { ...createTaskDto, workspaceId: workspace._id.toString() },
      userId,
    );
  }

  async findAll(
    filterDto: FilterTaskDto,
    currentUserId?: string,
  ): Promise<TaskListDto> {
    if (filterDto.workspaceId && currentUserId) {
      await this.ensureWorkspaceMember(filterDto.workspaceId, currentUserId);
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
    this.validateObjectId(workspaceId, 'Workspace');
    if (currentUserId) {
      await this.ensureWorkspaceMember(workspaceId, currentUserId);
    }

    const tasks = await this.tasksRepository.findByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findByWorkspaceKey(
    workspaceKey: string,
    currentUserId?: string,
  ): Promise<TaskDto[]> {
    const workspace = await this.workspacesService.findByKey(workspaceKey);
    return this.findByWorkspace(workspace._id.toString(), currentUserId);
  }

  async findById(id: string): Promise<TaskDto> {
    this.validateObjectId(id, 'Task');

    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async findByKey(key: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findByKey(key);
    if (!task) {
      throw new NotFoundException(`Task with key ${key} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    this.validateObjectId(id, 'Task');

    const existing = await this.tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const workspaceId = this.toId(existing.workspaceId);
    if (updateTaskDto.assigneeId) {
      await this.validateAssignee(updateTaskDto.assigneeId, workspaceId);
    }
    if (updateTaskDto.boardId) {
      await this.validateBoard(updateTaskDto.boardId, workspaceId);
    }
    if (updateTaskDto.sprintId) {
      await this.validateSprint(updateTaskDto.sprintId, workspaceId);
    }

    const updateData: Record<string, unknown> = {
      ...updateTaskDto,
    };
    delete updateData.status;
    delete updateData.boardColumnId;

    if (updateTaskDto.assigneeId) {
      updateData.assigneeId = new Types.ObjectId(updateTaskDto.assigneeId);
    }
    if (updateTaskDto.sprintId) {
      updateData.sprintId = new Types.ObjectId(updateTaskDto.sprintId);
    }
    if (updateTaskDto.boardId) {
      updateData.boardId = new Types.ObjectId(updateTaskDto.boardId);
    }
    if (
      updateTaskDto.columnId ||
      updateTaskDto.boardColumnId ||
      updateTaskDto.status
    ) {
      updateData.columnId =
        updateTaskDto.columnId ||
        updateTaskDto.boardColumnId ||
        updateTaskDto.status;
    }
    if (updateTaskDto.dueDate) {
      updateData.dueDate = new Date(updateTaskDto.dueDate);
    }

    const task = await this.tasksRepository.update(id, updateData);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.taskMapper.mapToDto(task);
  }

  async delete(id: string): Promise<void> {
    this.validateObjectId(id, 'Task');

    const deleted = await this.tasksRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
  }

  private async normalizeKanbanTask(
    dto: CreateTaskDto,
    workspaceId: string,
  ): Promise<CreateTaskDto> {
    if (dto.sprintId) {
      throw new BadRequestException(
        'Kanban workspace task cannot have sprintId',
      );
    }

    const board = dto.boardId
      ? await this.kanbanService.findById(dto.boardId)
      : (await this.kanbanService.findByWorkspace(workspaceId))[0] ||
        (await this.kanbanService.createDefaultBoard(workspaceId));

    if (board.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Board does not belong to this workspace');
    }

    const requestedColumn = dto.columnId || dto.boardColumnId || dto.status;
    const column =
      board.columns.find(
        (item) =>
          item.id === requestedColumn ||
          (item.mappedStatuses || []).includes(requestedColumn || ''),
      ) ||
      [...board.columns].sort((left, right) => left.order - right.order)[0];

    if (!column) {
      throw new BadRequestException('Kanban board has no columns');
    }

    return {
      ...dto,
      boardId: board._id.toString(),
      columnId: column.id,
      boardColumnId: column.id,
      status: column.id,
      sprintId: undefined,
    };
  }

  private async normalizeScrumTask(
    dto: CreateTaskDto,
    workspaceId: string,
  ): Promise<CreateTaskDto> {
    if (dto.boardId) {
      throw new BadRequestException('Scrum workspace task cannot have boardId');
    }
    if (dto.sprintId) {
      await this.validateSprint(dto.sprintId, workspaceId);
    }

    return {
      ...dto,
      columnId: dto.columnId || dto.boardColumnId || dto.status || 'todo',
    };
  }

  private async validateBoard(
    boardId: string,
    workspaceId: string,
  ): Promise<void> {
    this.validateObjectId(boardId, 'Board');
    const board = await this.kanbanService.findById(boardId);
    if (board.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Board does not belong to this workspace');
    }
  }

  private async validateSprint(
    sprintId: string,
    workspaceId: string,
  ): Promise<void> {
    this.validateObjectId(sprintId, 'Sprint');
    const sprints = await this.scrumService.findByWorkspace(workspaceId);
    const belongsToWorkspace = sprints.some(
      (sprint) => sprint._id.toString() === sprintId,
    );
    if (!belongsToWorkspace) {
      throw new BadRequestException('Sprint does not belong to this workspace');
    }
  }

  private async validateAssignee(
    assigneeId: string,
    workspaceId: string,
  ): Promise<void> {
    this.validateObjectId(assigneeId, 'Assignee');
    await this.usersService.getUserById(assigneeId);
    const isMember = await this.workspacesService.isMember(
      workspaceId,
      assigneeId,
    );
    if (!isMember) {
      throw new BadRequestException(
        'Assignee must be a member of this workspace',
      );
    }
  }

  private async ensureWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const isMember = await this.workspacesService.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private validateObjectId(id: string, resourceName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${resourceName} ID format`);
    }
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }
}
