import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { LabelService } from '../../labels/services/label.service';
import {
  ExportTasksDto,
  ExportFormat,
} from '../dtos/requests/export-tasks.dto';
import { TaskDocument } from '../schemas/task.schema';
import { TaskWordExportService } from './task-word-export.service';

const MAX_EXPORT_ROWS = 10000;

const CSV_INJECTION_CHARS = ['=', '+', '-', '@'];

const EXPORT_COLUMNS = [
  'Key',
  'Title',
  'Description',
  'Type',
  'Status',
  'Priority',
  'Assignee',
  'Reporter',
  'Story Points',
  'Labels',
  'Sprint',
  'Start Date',
  'Due Date',
  'Time Logged (h)',
  'Time Estimated (h)',
  'Created At',
  'Updated At',
  'URL',
];

export interface ResolvedMaps {
  users: Map<string, string>;
  columns: Map<string, string>;
  sprints: Map<string, string>;
  labels: Map<string, string>;
}

@Injectable()
export class TaskCsvExportService {
  constructor(
    private readonly tasksRepository: TaskReadRepository,
    private readonly kanbanService: KanbanService,
    @Inject(forwardRef(() => ScrumService))
    private readonly scrumService: ScrumService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => LabelService))
    private readonly labelService: LabelService,
    private readonly taskWordExportService: TaskWordExportService,
  ) {}

  async exportTasks(
    workspaceId: string,
    userId: string,
    dto: ExportTasksDto,
    baseUrl: string,
  ): Promise<{ file: StreamableFile; contentType: string; filename: string }> {
    const tasks = await this.queryTasks(workspaceId, dto);

    if (tasks.length === 0) {
      throw new BadRequestException(
        'Không có task nào để export. Hãy kiểm tra lại bộ lọc.',
      );
    }

    if (tasks.length > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `Số lượng task vượt quá giới hạn ${MAX_EXPORT_ROWS}. Vui lòng áp dụng bộ lọc để giảm số lượng.`,
      );
    }

    const resolved = await this.batchResolve(workspaceId, userId, tasks);
    const rows = tasks.map(task =>
      this.taskToRow(task, resolved, baseUrl, workspaceId),
    );

    const format = dto.format ?? ExportFormat.CSV;

    if (format === ExportFormat.XLSX) {
      return this.buildXlsx(rows, workspaceId);
    }
    if (format === ExportFormat.DOCX) {
      return await this.taskWordExportService.buildDocx(
        tasks,
        resolved,
        baseUrl,
        workspaceId,
      );
    }

    return this.buildCsv(rows, workspaceId);
  }

  private async queryTasks(
    workspaceId: string,
    dto: ExportTasksDto,
  ): Promise<TaskDocument[]> {
    const filter: Record<string, unknown> = {
      workspaceId,
      isDeleted: { $ne: true },
      isArchived: { $ne: true },
    };

    if (dto.status) {
      filter.status = { $in: dto.status.split(',') };
    }
    if (dto.assigneeId) {
      filter.assigneeId = { $in: dto.assigneeId.split(',') };
    }
    if (dto.type) {
      filter.type = { $in: dto.type.split(',') };
    }
    if (dto.priority) {
      filter.priority = { $in: dto.priority.split(',') };
    }
    if (dto.sprintId) {
      filter.sprintId = dto.sprintId;
    }

    const result = await this.tasksRepository.findAll({
      workspaceId,
      status: dto.status ? dto.status.split(',') : undefined,
      assigneeId: dto.assigneeId,
      type: dto.type,
      priority: dto.priority,
      search: dto.search,
      sprintId: dto.sprintId,
      limit: MAX_EXPORT_ROWS,
      page: 1,
    });

    return result.tasks;
  }

  private async batchResolve(
    workspaceId: string,
    userId: string,
    tasks: TaskDocument[],
  ): Promise<ResolvedMaps> {
    const userIds = new Set<string>();
    const labelIds = new Set<string>();

    const extractId = (val: any) => {
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
          if (lIdStr) labelIds.add(lIdStr);
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

  private taskToRow(
    task: TaskDocument,
    resolved: ResolvedMaps,
    baseUrl: string,
    workspaceId: string,
  ): string[] {
    const plain = typeof task.toObject === 'function' ? task.toObject() : task;

    const extractId = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (val._id) return val._id.toString();
      if (val.id) return val.id.toString();
      return val.toString();
    };

    const aId = extractId(plain.assigneeId);
    let assigneeName = aId ? resolved.users.get(aId) : '';
    if (!assigneeName && plain.assigneeId?.fullName) {
      assigneeName = plain.assigneeId.fullName;
    } else if (!assigneeName && plain.assigneeId?.email) {
      assigneeName = plain.assigneeId.email;
    }
    assigneeName = assigneeName || '';

    const rId = extractId(plain.reporterId);
    let reporterName = rId ? resolved.users.get(rId) : '';
    if (!reporterName && plain.reporterId?.fullName) {
      reporterName = plain.reporterId.fullName;
    } else if (!reporterName && plain.reporterId?.email) {
      reporterName = plain.reporterId.email;
    }
    reporterName = reporterName || '';

    const cId = extractId(plain.columnId);
    const statusName = cId
      ? resolved.columns.get(cId) || plain.status || ''
      : plain.status || '';

    const sId = extractId(plain.sprintId);
    let sprintName = sId ? resolved.sprints.get(sId) : '';
    if (!sprintName && plain.sprintId?.name) {
      sprintName = plain.sprintId.name;
    }
    sprintName = sprintName || '';

    const labelNames = (plain.labelIds || [])
      .map((idVal: any) => {
        const lId = extractId(idVal);
        let name = lId ? resolved.labels.get(lId) : '';
        if (!name && idVal?.name) name = idVal.name;
        return name || '';
      })
      .filter(Boolean)
      .join('; ');

    const description = this.stripMarkdown(plain.description || '');

    const taskUrl = `${baseUrl}/workspaces/${workspaceId}?tab=list&task=${plain.key}`;

    const typeName = this.capitalize(plain.type || '');
    const priorityName = this.capitalize(plain.priority || '');

    return [
      this.escapeCsvInjection(plain.key || ''),
      this.escapeCsvInjection(plain.title || ''),
      this.escapeCsvInjection(description),
      typeName,
      statusName,
      priorityName,
      assigneeName,
      reporterName,
      plain.storyPoints != null ? String(plain.storyPoints) : '',
      labelNames,
      sprintName,
      plain.startDate ? this.formatDate(plain.startDate) : '',
      plain.dueDate ? this.formatDate(plain.dueDate) : '',
      plain.timeLogged != null ? String(plain.timeLogged) : '0',
      plain.timeEstimated != null ? String(plain.timeEstimated) : '',
      plain.createdAt ? this.formatDate(plain.createdAt) : '',
      plain.updatedAt ? this.formatDate(plain.updatedAt) : '',
      taskUrl,
    ];
  }

  private buildCsv(
    rows: string[][],
    workspaceId: string,
  ): { file: StreamableFile; contentType: string; filename: string } {
    const csvContent = stringify([EXPORT_COLUMNS, ...rows]);
    const bom = '\uFEFF';
    const buffer = Buffer.from(bom + csvContent, 'utf-8');

    const filename = `tasks-${workspaceId}-${this.dateStamp()}.csv`;

    return {
      file: new StreamableFile(buffer),
      contentType: 'text/csv; charset=utf-8',
      filename,
    };
  }

  private buildXlsx(
    rows: string[][],
    workspaceId: string,
  ): { file: StreamableFile; contentType: string; filename: string } {
    const ws = XLSX.utils.aoa_to_sheet([EXPORT_COLUMNS, ...rows]);

    const colWidths = EXPORT_COLUMNS.map((header, i) => {
      let maxLen = header.length;
      for (const row of rows) {
        if (row[i] && row[i].length > maxLen) {
          maxLen = Math.min(row[i].length, 50);
        }
      }
      return { wch: maxLen + 2 };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `tasks-${workspaceId}-${this.dateStamp()}.xlsx`;

    return {
      file: new StreamableFile(xlsxBuffer as Buffer),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }

  private escapeCsvInjection(value: string): string {
    if (!value) return value;
    const trimmed = value.trimStart();
    if (trimmed.length > 0 && CSV_INJECTION_CHARS.includes(trimmed.charAt(0))) {
      return "'" + value;
    }
    return value;
  }

  private stripMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/#{1,6}\s?/g, '')
      .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, match => match.replace(/`/g, ''))
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/---+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private capitalize(value: string): string {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }

  private dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
}
