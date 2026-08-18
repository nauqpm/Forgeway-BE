import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { UnmappableStatusException } from '../exceptions/unmappable-status.exception';
import { TaskReadRepository } from '../repositories/task-read.repository';

@Injectable()
export class TaskCreationValidationService {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly kanbanService: KanbanService,
    private readonly scrumService: ScrumService,
    private readonly usersService: UsersService,
    private readonly taskReadRepository: TaskReadRepository,
  ) {}

  async validateCreateRequest(
    dto: CreateTaskDto,
    workspaceId: string,
    userId: string,
  ): Promise<any> {
    this.validateObjectId(workspaceId, 'Workspace');
    const workspace = await this.workspacesService.findById(workspaceId);

    await this.validateWorkspaceMember(workspaceId, userId);
    if (dto.assigneeId) {
      await this.validateAssignee(dto.assigneeId, workspaceId);
    }

    if (dto.type === 'subtask') {
      if (!dto.parentId) {
        throw new BadRequestException(
          'Parent ID is required when creating a subtask',
        );
      }
      await this.validateSubtaskParent(dto.parentId, workspaceId);
    }

    return workspace;
  }

  async validateUpdateRequest(
    dto: UpdateTaskDto,
    workspaceId: string,
    existingTask?: any,
  ): Promise<void> {
    if (dto.assigneeId) {
      await this.validateAssignee(dto.assigneeId, workspaceId);
    }
    if (dto.boardId) {
      await this.validateBoard(dto.boardId, workspaceId);
    }
    if (dto.sprintId) {
      await this.validateSprint(dto.sprintId, workspaceId);
    }
    await this.validateTypeTransition(dto, workspaceId, existingTask);
  }

  private async validateTypeTransition(
    dto: UpdateTaskDto,
    workspaceId: string,
    existingTask?: any,
  ): Promise<void> {
    if (!dto.type || !existingTask || dto.type === existingTask.type) {
      return;
    }

    if (dto.type === 'subtask' || dto.type === 'epic') {
      throw new BadRequestException(
        `Cannot change task type to ${dto.type} through the generic task update endpoint`,
      );
    }

    if (existingTask.type === 'subtask' || existingTask.type === 'epic') {
      throw new BadRequestException(
        `Cannot change ${existingTask.type} type through the generic task update endpoint`,
      );
    }

    const status = dto.status ?? existingTask.status;
    const columnId = dto.columnId ?? existingTask.columnId;
    if (!status && !columnId) {
      throw new UnmappableStatusException(dto.type);
    }

    const workspace = existingTask.workspaceId?.type
      ? existingTask.workspaceId
      : await this.workspacesService.findById(workspaceId);
    if (workspace?.type !== 'kanban') {
      return;
    }

    const boardId = dto.boardId ?? this.toId(existingTask.boardId);
    if (!boardId) {
      throw new UnmappableStatusException(
        dto.type,
        `Cannot change task type to ${dto.type}: the current task has no board workflow`,
      );
    }

    const board = await this.kanbanService.findById(boardId);
    const normalize = (value?: string) =>
      (value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
    const normalizedStatus = normalize(status);
    const belongsToWorkflow = board.columns.some(
      column =>
        column.id === columnId ||
        normalize(column.name) === normalizedStatus ||
        column.mappedStatuses?.some(
          mappedStatus => normalize(mappedStatus) === normalizedStatus,
        ),
    );

    if (!belongsToWorkflow) {
      throw new UnmappableStatusException(dto.type);
    }
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  async getWorkspaceById(workspaceId: string): Promise<any> {
    this.validateObjectId(workspaceId, 'Workspace');
    return this.workspacesService.findById(workspaceId);
  }

  async validateWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  async validateAssignee(
    assigneeId: string,
    workspaceId: string,
  ): Promise<void> {
    this.validateObjectId(assigneeId, 'Assignee');
    await this.usersService.getUserById(assigneeId);

    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      assigneeId,
    );
    if (!isMember) {
      throw new BadRequestException(
        'Assignee must be a member of this workspace',
      );
    }
  }

  async validateBoard(boardId: string, workspaceId: string): Promise<void> {
    this.validateObjectId(boardId, 'Board');
    const board = await this.kanbanService.findById(boardId);
    if (board.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('Board does not belong to this workspace');
    }
  }

  async validateSprint(sprintId: string, workspaceId: string): Promise<void> {
    this.validateObjectId(sprintId, 'Sprint');
    await this.scrumService.ensureSprintAssignable(workspaceId, sprintId);
  }

  private async validateSubtaskParent(
    parentId: string,
    workspaceId: string,
  ): Promise<void> {
    this.validateObjectId(parentId, 'Parent task');

    const parent = await this.taskReadRepository.findByIdInWorkspace(
      parentId,
      workspaceId,
    );
    if (!parent) {
      throw new BadRequestException(
        `Parent task with ID ${parentId} not found in this workspace`,
      );
    }

    if (parent.type === 'subtask') {
      throw new BadRequestException(
        'Cannot create a subtask under another subtask (only one level of nesting allowed)',
      );
    }

    if (parent.type === 'epic') {
      throw new BadRequestException(
        'Cannot create a subtask under an Epic. Use child issues instead.',
      );
    }
  }

  validateObjectId(id: string, resourceName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${resourceName} ID format`);
    }
  }
}
