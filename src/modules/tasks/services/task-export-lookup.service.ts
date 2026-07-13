import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { LabelService } from '../../labels/services/label.service';
import { TaskDocument } from '../schemas/task.schema';

export interface ResolvedMaps {
  users: Map<string, string>;
  columns: Map<string, string>;
  sprints: Map<string, string>;
  labels: Map<string, string>;
}

@Injectable()
export class TaskExportLookupService {
  constructor(
    private readonly kanbanService: KanbanService,
    @Inject(forwardRef(() => ScrumService))
    private readonly scrumService: ScrumService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => LabelService))
    private readonly labelService: LabelService,
  ) {}

  async resolve(
    workspaceId: string,
    userId: string,
    tasks: TaskDocument[],
  ): Promise<ResolvedMaps> {
    const userIds = new Set<string>();

    const extractId = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (val._id) return val._id.toString();
      if (val.id) return val.id.toString();
      return val.toString();
    };

    for (const task of tasks) {
      const aId = extractId(task.assigneeId);
      if (aId) userIds.add(aId);

      const rId = extractId(task.reporterId);
      if (rId) userIds.add(rId);

      if (task.labelIds) {
        for (const lid of task.labelIds) {
          const lIdStr = extractId(lid);
          if (lIdStr) userIds.add(lIdStr);
        }
      }
    }

    const [usersResult, boards, sprints, labelsResult] = await Promise.all([
      userIds.size > 0
        ? this.usersService.getUsersByIds([...userIds])
        : Promise.resolve([]),
      this.kanbanService.findByWorkspaceId(workspaceId),
      this.scrumService.findByWorkspace(workspaceId),
      this.labelService.findByWorkspace(workspaceId, userId),
    ]);

    const usersMap = new Map<string, string>();
    for (const u of usersResult) {
      const doc = u as any;
      const id = (doc._id || doc.id)?.toString();
      if (id) {
        usersMap.set(id, doc.fullName || doc.email || id);
      }
    }

    const columnsMap = new Map<string, string>();
    for (const board of boards) {
      const cols = (board as any).columns;
      if (Array.isArray(cols)) {
        for (const col of cols) {
          columnsMap.set(col.id, col.name);
        }
      }
    }

    const sprintsMap = new Map<string, string>();
    for (const s of sprints) {
      const doc = typeof s.toObject === 'function' ? s.toObject() : s;
      const id = (doc._id || doc.id)?.toString();
      if (id) {
        sprintsMap.set(id, doc.name || id);
      }
    }

    const labelsMap = new Map<string, string>();
    for (const l of labelsResult) {
      if (l.id) {
        labelsMap.set(l.id, l.name || l.id);
      }
    }

    return {
      users: usersMap,
      columns: columnsMap,
      sprints: sprintsMap,
      labels: labelsMap,
    };
  }
}
