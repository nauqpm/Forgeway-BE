import { BadRequestException, Injectable } from '@nestjs/common';
import { KanbanService } from '../../kanban/services/kanban.service';
import { BoardColumn } from '../../kanban/schemas/kanban-board.schema';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskCreationValidationService } from './task-creation-validation.service';

@Injectable()
export class TaskNormalizerService {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly validationService: TaskCreationValidationService,
  ) {}

  async normalizeForWorkspaceType(
    dto: CreateTaskDto,
    workspace: any,
  ): Promise<CreateTaskDto> {
    const workspaceId = workspace._id.toString();

    if (workspace.type === 'kanban') {
      return this.normalizeKanbanTask(dto, workspaceId);
    }

    return this.normalizeScrumTask(dto, workspaceId);
  }

  async normalizeUpdateForWorkspaceType(
    dto: UpdateTaskDto,
    existingTask: any,
  ): Promise<UpdateTaskDto> {
    const workspace = existingTask.workspaceId;
    const workspaceType = workspace?.type;

    if (workspaceType !== 'kanban') {
      if (dto.boardId) {
        throw new BadRequestException(
          'Scrum workspace task cannot have boardId',
        );
      }
      return dto;
    }

    if (dto.sprintId) {
      throw new BadRequestException(
        'Kanban workspace task cannot have sprintId',
      );
    }

    if (!dto.columnId && !dto.status && !dto.boardId) {
      return dto;
    }

    const workspaceId = this.toId(existingTask.workspaceId);
    const boardId = dto.boardId || this.toOptionalId(existingTask.boardId);
    if (!boardId) {
      return dto;
    }

    const board = await this.kanbanService.findById(boardId);
    if (board.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Board does not belong to this workspace');
    }

    const column =
      this.resolveKanbanColumn(board.columns, dto.columnId, dto.status) ||
      this.getFirstKanbanColumn(board.columns);

    if (!column) {
      throw new BadRequestException('Kanban board has no columns');
    }

    return {
      ...dto,
      boardId,
      columnId: column.id,
      status: this.resolveTaskStatus(column, dto.status),
      sprintId: undefined,
    };
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
      : await this.kanbanService.findOrCreateByWorkspaceId(workspaceId);

    if (board.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Board does not belong to this workspace');
    }

    const column =
      this.resolveKanbanColumn(board.columns, dto.columnId, dto.status) ||
      this.getFirstKanbanColumn(board.columns);

    if (!column) {
      throw new BadRequestException('Kanban board has no columns');
    }

    const status = this.resolveTaskStatus(column, dto.status);

    return {
      ...dto,
      boardId: board._id.toString(),
      columnId: column.id,
      status,
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
      await this.validationService.validateSprint(dto.sprintId, workspaceId);
    }

    return {
      ...dto,
      status: dto.status || 'todo',
      columnId: dto.columnId,
    };
  }

  private resolveKanbanColumn(
    columns: BoardColumn[],
    columnId?: string,
    status?: string,
  ): BoardColumn | undefined {
    if (columnId) {
      const column = columns.find(item => item.id === columnId);
      if (!column) {
        throw new BadRequestException(
          `Column "${columnId}" does not exist in this board`,
        );
      }
      return column;
    }

    if (status) {
      const column = columns.find(
        item =>
          item.id === status || (item.mappedStatuses || []).includes(status),
      );
      if (!column) {
        throw new BadRequestException(
          `Status "${status}" does not map to any column in this board`,
        );
      }
      return column;
    }

    return undefined;
  }

  private getFirstKanbanColumn(
    columns: BoardColumn[],
  ): BoardColumn | undefined {
    return [...columns].sort((left, right) => left.order - right.order)[0];
  }

  private resolveTaskStatus(
    column: BoardColumn,
    requestedStatus?: string,
  ): string {
    if (requestedStatus) {
      return requestedStatus;
    }

    return (column.mappedStatuses || [])[0] || column.id;
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  private toOptionalId(value: any): string | undefined {
    const id = this.toId(value);
    return id || undefined;
  }
}
