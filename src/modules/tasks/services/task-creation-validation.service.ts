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

@Injectable()
export class TaskCreationValidationService {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly kanbanService: KanbanService,
    private readonly scrumService: ScrumService,
    private readonly usersService: UsersService,
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

    return workspace;
  }

  async validateUpdateRequest(
    dto: UpdateTaskDto,
    workspaceId: string,
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

  validateObjectId(id: string, resourceName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${resourceName} ID format`);
    }
  }
}
