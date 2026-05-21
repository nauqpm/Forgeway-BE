import { Injectable } from '@nestjs/common';
import {
  CreateTaskDto,
  FilterTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { TaskDto, TaskListDto } from '../dtos/responses/task.dto';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskMovementService } from './task-movement.service';
import { TaskStatusService } from './task-status.service';
import { TasksService } from './tasks.service';

@Injectable()
export class TasksFacadeService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly assignmentService: TaskAssignmentService,
    private readonly statusService: TaskStatusService,
    private readonly movementService: TaskMovementService,
  ) {}

  findAll(filterDto: FilterTaskDto): Promise<TaskListDto> {
    return this.tasksService.findAll(filterDto);
  }

  findByKey(key: string): Promise<TaskDto> {
    return this.tasksService.findByKey(key);
  }

  findById(id: string): Promise<TaskDto> {
    return this.tasksService.findById(id);
  }

  findByWorkspace(workspaceId: string): Promise<TaskDto[]> {
    return this.tasksService.findByWorkspace(workspaceId);
  }

  findBySprint(sprintId: string): Promise<TaskDto[]> {
    return this.tasksService.findBySprint(sprintId);
  }

  findByKanbanBoard(boardId: string): Promise<Record<string, TaskDto[]>> {
    return this.tasksService.findByBoard(boardId);
  }

  findByAssignee(userId: string): Promise<TaskDto[]> {
    return this.tasksService.findByAssignee(userId);
  }

  createInWorkspace(
    workspaceId: string,
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<TaskDto> {
    return this.tasksService.create({ ...createTaskDto, workspaceId }, userId);
  }

  update(id: string, updateTaskDto: UpdateTaskDto): Promise<TaskDto> {
    return this.tasksService.update(id, updateTaskDto);
  }

  delete(id: string): Promise<void> {
    return this.tasksService.delete(id);
  }

  assignTo(id: string, userId: string): Promise<TaskDto> {
    return this.assignmentService.assignTo(id, userId);
  }

  unassign(id: string): Promise<TaskDto> {
    return this.assignmentService.unassign(id);
  }

  changeStatus(id: string, status: string): Promise<TaskDto> {
    return this.statusService.changeStatus(id, status);
  }

  moveToKanbanColumn(
    id: string,
    kanbanBoardId: string,
    columnId: string,
  ): Promise<TaskDto> {
    return this.movementService.moveToBoard(id, kanbanBoardId, columnId);
  }
}
