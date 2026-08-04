import { Injectable, BadRequestException } from '@nestjs/common';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { UsersService } from '../../users/services/users.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { LabelService } from '../../labels/services/label.service';
import { KanbanService } from '../../kanban/services/kanban.service';
import { BoardColumn } from '../../kanban/schemas/kanban-board.schema';

export interface ImportLookupMaps {
  userEmailMap: Map<string, string>;
  sprintMap: Map<string, string>;
  labelMap: Map<string, string>;
  taskKeyMap: Map<string, { id: string; type: string }>;
  kanbanColumns?: BoardColumn[];
}

import { TaskReadRepository } from '../repositories/task-read.repository';

@Injectable()
export class CsvImportLookupService {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly usersService: UsersService,
    private readonly scrumService: ScrumService,
    private readonly labelService: LabelService,
    private readonly kanbanService: KanbanService,
    private readonly taskReadRepository: TaskReadRepository,
  ) {}

  async buildLookupMaps(
    workspaceId: string,
    userId: string,
  ): Promise<ImportLookupMaps> {
    const workspace = await this.workspacesService.findById(workspaceId);
    if (!workspace) {
      throw new BadRequestException('Workspace không tồn tại');
    }

    const [userEmailMap, sprintMap, labelMap, taskKeyMap] = await Promise.all([
      this.buildUserEmailMap(workspace),
      this.buildSprintMap(workspaceId),
      this.buildLabelMap(workspaceId, userId),
      this.buildTaskKeyMap(workspaceId),
    ]);

    let kanbanColumns: BoardColumn[] | undefined;
    if (workspace.type === 'kanban') {
      const board =
        await this.kanbanService.findOrCreateByWorkspaceId(workspaceId);
      kanbanColumns = board?.columns;
    }

    return { userEmailMap, sprintMap, labelMap, taskKeyMap, kanbanColumns };
  }

  private async buildUserEmailMap(
    workspace: Awaited<ReturnType<WorkspacesService['findById']>>,
  ): Promise<Map<string, string>> {
    const memberIds = workspace!.members.map(m => m.userId.toString());

    const settled = await Promise.allSettled(
      memberIds.map(id => this.usersService.getUserById(id)),
    );

    const map = new Map<string, string>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const user = result.value as {
        _id: { toString(): string } | string;
        email: string;
      } | null;
      if (user?.email) {
        map.set(user.email.toLowerCase(), (user._id as any).toString());
      }
    }

    return map;
  }

  private async buildSprintMap(
    workspaceId: string,
  ): Promise<Map<string, string>> {
    const sprints = await this.scrumService.findByWorkspace(workspaceId);
    const map = new Map<string, string>();
    for (const s of sprints) {
      map.set(s.name.trim().toLowerCase(), s._id.toString());
    }
    return map;
  }

  private async buildLabelMap(
    workspaceId: string,
    userId: string,
  ): Promise<Map<string, string>> {
    const labels = await this.labelService.findByWorkspace(workspaceId, userId);
    const map = new Map<string, string>();
    for (const l of labels) {
      map.set(l.name.trim().toLowerCase(), l.id);
    }
    return map;
  }

  private async buildTaskKeyMap(
    workspaceId: string,
  ): Promise<Map<string, { id: string; type: string }>> {
    const tasks = await this.taskReadRepository.findByWorkspace(workspaceId);
    const map = new Map<string, { id: string; type: string }>();
    for (const t of tasks) {
      if (t.key) {
        map.set(t.key.trim().toLowerCase(), {
          id: t._id.toString(),
          type: t.type,
        });
      }
    }
    return map;
  }
}
