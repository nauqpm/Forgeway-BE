import { BadRequestException, Injectable } from '@nestjs/common';
import { KanbanService } from '../../kanban/services/kanban.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
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
      await this.validationService.validateSprint(dto.sprintId, workspaceId);
    }

    return {
      ...dto,
      columnId: dto.columnId || dto.boardColumnId || dto.status || 'todo',
    };
  }
}

