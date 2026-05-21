import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { CreateTaskData } from '../interfaces/task.interface';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
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
    const workspaceId = await this.resolveWorkspaceId(createTaskDto, userId);
    const workspace = await this.workspacesService.findById(workspaceId);

    const isMember = await this.workspacesService.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const normalizedDto = await this.prepareCreateDataForWorkspaceType(
      createTaskDto,
      workspaceId,
      workspace.type,
    );
    const taskNumber =
      (await this.tasksRepository.countByWorkspace(workspaceId)) + 1;
    const key = this.taskKeyService.create(
      workspace.name || workspace.key,
      taskNumber,
    );
    await this.validateCreateReferences(normalizedDto, workspaceId);
    const taskData = this.buildCreateData(
      normalizedDto,
      workspaceId,
      userId,
      key,
    );

    const task = await this.tasksRepository.create(taskData);
    this.logger.log(`Task created: ${key} by user ${userId}`);
    return this.taskMapper.mapToDto(task);
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

  async findAll(filterDto: FilterTaskDto): Promise<TaskListDto> {
    const result = await this.tasksRepository.findAll(filterDto);
    return {
      tasks: this.taskMapper.mapToDtos(result.tasks),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findByWorkspace(workspaceId: string): Promise<TaskDto[]> {
    this.validateObjectId(workspaceId, 'Workspace');
    const tasks = await this.tasksRepository.findByWorkspace(workspaceId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findBySprint(sprintId: string): Promise<TaskDto[]> {
    this.validateObjectId(sprintId, 'Sprint');
    const tasks = await this.tasksRepository.findBySprint(sprintId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async findByBoard(boardId: string): Promise<Record<string, TaskDto[]>> {
    this.validateObjectId(boardId, 'Board');
    const tasks = await this.tasksRepository.findByBoard(boardId);
    const groupedByColumn: Record<string, TaskDto[]> = {};

    for (const task of tasks) {
      const dto = this.taskMapper.mapToDto(task);
      const columnId = dto.columnId || dto.boardColumnId || 'none';
      if (!groupedByColumn[columnId]) {
        groupedByColumn[columnId] = [];
      }
      groupedByColumn[columnId].push(dto);
    }

    return groupedByColumn;
  }

  async findByAssignee(userId: string): Promise<TaskDto[]> {
    this.validateObjectId(userId, 'User');
    const tasks = await this.tasksRepository.findByAssignee(userId);
    return this.taskMapper.mapToDtos(tasks);
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    this.validateObjectId(id, 'Task');

    const existing = await this.tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    await this.validateUpdateReferences(updateTaskDto);
    const updateData = this.buildUpdateData(updateTaskDto);
    const task = await this.tasksRepository.update(id, updateData);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    this.logger.log(`Task updated: ${task.key}`);
    return this.taskMapper.mapToDto(task);
  }

  async delete(id: string): Promise<void> {
    this.validateObjectId(id, 'Task');

    const existing = await this.tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    await this.tasksRepository.delete(id);
    this.logger.log(`Task deleted: ${id}`);
  }

  private async resolveWorkspaceId(
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<string> {
    let workspaceId = createTaskDto.workspaceId;
    if (!workspaceId) {
      const workspaces = await this.workspacesService.findByUserId(userId);
      if (workspaces.length === 0) {
        throw new NotFoundException(
          'No workspace found. Please create a workspace first.',
        );
      }
      workspaceId = workspaces[0]._id.toString();
    }
    if (!workspaceId) {
      throw new NotFoundException('Workspace is required to create a task.');
    }

    this.validateObjectId(workspaceId, 'Workspace');
    return workspaceId;
  }

  private buildCreateData(
    createTaskDto: CreateTaskDto,
    workspaceId: string,
    userId: string,
    key: string,
  ): CreateTaskData {
    const taskData: CreateTaskData = {
      title: createTaskDto.title,
      description: createTaskDto.description || undefined,
      workspaceId: new Types.ObjectId(workspaceId),
      reporterId: new Types.ObjectId(userId),
      key,
      priority: (createTaskDto.priority ||
        'medium') as CreateTaskData['priority'],
      type: (createTaskDto.type || 'task') as CreateTaskData['type'],
      labels: createTaskDto.labels || [],
      attachments: [],
      columnId:
        createTaskDto.columnId ||
        createTaskDto.boardColumnId ||
        createTaskDto.status ||
        'todo',
    };

    if (createTaskDto.sprintId) {
      taskData.sprintId = new Types.ObjectId(createTaskDto.sprintId);
    }
    if (createTaskDto.boardId) {
      taskData.boardId = new Types.ObjectId(createTaskDto.boardId);
    }
    if (createTaskDto.assigneeId) {
      taskData.assigneeId = new Types.ObjectId(createTaskDto.assigneeId);
    }
    if (createTaskDto.storyPoints !== undefined) {
      taskData.storyPoints = createTaskDto.storyPoints;
    }
    if (createTaskDto.dueDate) {
      taskData.dueDate = new Date(createTaskDto.dueDate);
    }
    if (createTaskDto.parentId) {
      taskData.parentId = new Types.ObjectId(createTaskDto.parentId);
    }
    if (createTaskDto.epicId) {
      taskData.epicId = new Types.ObjectId(createTaskDto.epicId);
    }

    return taskData;
  }

  private async prepareCreateDataForWorkspaceType(
    createTaskDto: CreateTaskDto,
    workspaceId: string,
    workspaceType?: string,
  ): Promise<CreateTaskDto> {
    if (workspaceType !== 'kanban') {
      return createTaskDto;
    }

    if (createTaskDto.sprintId) {
      throw new BadRequestException(
        'Kanban workspace tasks cannot be assigned to a sprint',
      );
    }

    const placement = await this.resolveKanbanTaskPlacement(
      workspaceId,
      createTaskDto.boardId,
      createTaskDto.columnId ||
        createTaskDto.boardColumnId ||
        createTaskDto.status,
    );

    return {
      ...createTaskDto,
      boardId: placement.boardId,
      columnId: placement.columnId,
      boardColumnId: placement.columnId,
      status: placement.columnId,
      sprintId: undefined,
    };
  }

  private async resolveKanbanTaskPlacement(
    workspaceId: string,
    boardId?: string,
    requestedColumnId?: string,
  ): Promise<{ boardId: string; columnId: string }> {
    const board = boardId
      ? await this.kanbanService.findById(boardId)
      : await this.resolveDefaultKanbanBoard(workspaceId);

    if (board.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Board does not belong to this workspace');
    }

    const columns = [...board.columns].sort(
      (left, right) => left.order - right.order,
    );
    if (columns.length === 0) {
      throw new BadRequestException('Kanban board has no columns');
    }

    const columnId = requestedColumnId
      ? this.resolveKanbanColumnId(columns, requestedColumnId)
      : columns[0].id;

    return {
      boardId: board._id.toString(),
      columnId,
    };
  }

  private async resolveDefaultKanbanBoard(workspaceId: string) {
    const boards = await this.kanbanService.findByWorkspace(workspaceId);
    if (boards.length > 0) {
      return boards[0];
    }

    return this.kanbanService.createDefaultBoard(workspaceId);
  }

  private resolveKanbanColumnId(
    columns: Array<{ id: string; mappedStatuses?: string[] }>,
    requestedColumnId: string,
  ): string {
    const column = columns.find(
      (item) =>
        item.id === requestedColumnId ||
        (item.mappedStatuses || []).includes(requestedColumnId),
    );

    if (!column) {
      throw new BadRequestException(
        `Column "${requestedColumnId}" does not exist in this board`,
      );
    }

    return column.id;
  }

  private buildUpdateData(updateTaskDto: UpdateTaskDto): Record<string, any> {
    const updateData: Record<string, any> = { ...updateTaskDto };
    delete updateData.boardColumnId;
    delete updateData.status;

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

    if (updateTaskDto.assigneeId) {
      updateData.assigneeId = new Types.ObjectId(updateTaskDto.assigneeId);
    }
    if (updateTaskDto.sprintId) {
      updateData.sprintId = new Types.ObjectId(updateTaskDto.sprintId);
    }
    if (updateTaskDto.boardId) {
      updateData.boardId = new Types.ObjectId(updateTaskDto.boardId);
    }
    if (updateTaskDto.parentId) {
      updateData.parentId = new Types.ObjectId(updateTaskDto.parentId);
    }
    if (updateTaskDto.epicId) {
      updateData.epicId = new Types.ObjectId(updateTaskDto.epicId);
    }
    if (updateTaskDto.dueDate) {
      updateData.dueDate = new Date(updateTaskDto.dueDate);
    }

    return updateData;
  }

  private async validateCreateReferences(
    createTaskDto: CreateTaskDto,
    workspaceId: string,
  ): Promise<void> {
    if (createTaskDto.boardId) {
      const board = await this.kanbanService.findById(createTaskDto.boardId);
      if (board.workspaceId.toString() !== workspaceId) {
        throw new BadRequestException(
          'Board does not belong to this workspace',
        );
      }
    }

    if (createTaskDto.sprintId) {
      this.validateObjectId(createTaskDto.sprintId, 'Sprint');
      const sprints = await this.scrumService.findByWorkspace(workspaceId);
      const sprintBelongsToWorkspace = sprints.some(
        (sprint) => sprint._id.toString() === createTaskDto.sprintId,
      );
      if (!sprintBelongsToWorkspace) {
        throw new BadRequestException(
          'Sprint does not belong to this workspace',
        );
      }
    }

    await this.validateSharedReferences(createTaskDto);
  }

  private async validateUpdateReferences(
    updateTaskDto: UpdateTaskDto,
  ): Promise<void> {
    if (updateTaskDto.boardId) {
      await this.kanbanService.findById(updateTaskDto.boardId);
    }
    if (updateTaskDto.sprintId) {
      this.validateObjectId(updateTaskDto.sprintId, 'Sprint');
    }

    await this.validateSharedReferences(updateTaskDto);
  }

  private async validateSharedReferences(
    dto: Pick<CreateTaskDto, 'assigneeId' | 'parentId' | 'epicId'>,
  ): Promise<void> {
    if (dto.assigneeId) {
      await this.usersService.getUserById(dto.assigneeId);
    }
    if (dto.parentId) {
      const parent = await this.tasksRepository.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException(
          `Parent task with ID ${dto.parentId} not found`,
        );
      }
    }
    if (dto.epicId) {
      const epic = await this.tasksRepository.findById(dto.epicId);
      if (!epic) {
        throw new NotFoundException(
          `Epic task with ID ${dto.epicId} not found`,
        );
      }
    }
  }

  private validateObjectId(id: string, resourceName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${resourceName} ID format`);
    }
  }
}
