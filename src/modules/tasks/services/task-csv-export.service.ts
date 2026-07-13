import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import * as ExcelJS from 'exceljs';
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
  'Assignee Name',
  'Reporter Name',
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
  ) { }

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
      return await this.buildXlsx(rows, workspaceId);
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

  async generateImportTemplate(
    workspaceId: string,
    format: 'csv' | 'xlsx' = 'xlsx',
  ): Promise<{ file: StreamableFile; contentType: string; filename: string }> {
    const importHeaders = [
      'Title',
      'Description',
      'Type',
      'Priority',
      'Status',
      'Assignee Email',
      'Story Points',
      'Start Date',
      'Due Date',
      'Labels',
      'Sprint',
      'Time Estimated (h)',
      'Time Logged (h)',
    ];

    const sampleRow = [
      'Example task',
      'Description for task',
      'Task',
      'Medium',
      'To do',
      'user@example.com',
      '5',
      '2026-01-01',
      '2026-01-15',
      'Frontend, Backend',
      'Sprint 1',
      '4.5',
      '2.5',
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import Template');

    worksheet.addRow(importHeaders);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF263238' },
    };
    headerRow.alignment = { horizontal: 'center' };

    worksheet.addRow(sampleRow);

    worksheet.columns.forEach((column, i) => {
      column.width = Math.max(importHeaders[i].length, sampleRow[i].length) + 2;
    });

    for (let i = 2; i <= 1000; i++) {
      worksheet.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Task,Bug,Story,Epic"'],
      };

      worksheet.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Lowest,Low,Medium,High,Highest"'],
      };

      worksheet.getCell(`E${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"To Do,In Progress,Done,In Process"'],
      };
    }

    // Add conditional formatting for Type
    worksheet.addConditionalFormatting({
      ref: 'C2:C1000',
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Task"'], style: { font: { color: { argb: 'FF2563EB' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Bug"'], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Story"'], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Epic"'], style: { font: { color: { argb: 'FF9333EA' }, bold: true } } },
      ] as any
    });

    // Add conditional formatting for Priority
    worksheet.addConditionalFormatting({
      ref: 'D2:D1000',
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Highest"'], style: { font: { color: { argb: 'FF8B0000' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"High"'], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Medium"'], style: { font: { color: { argb: 'FFD97706' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Low"'], style: { font: { color: { argb: 'FF2563EB' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Lowest"'], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
      ] as any
    });

    // Add conditional formatting for Status
    worksheet.addConditionalFormatting({
      ref: 'E2:E1000',
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"To do"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"To Do"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"In Process"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C6500' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"In Progress"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C6500' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Done"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' }, bold: true } } },
      ] as any
    });

    if (format === 'csv') {
      const csvContent = stringify([importHeaders, sampleRow]);
      const bom = '\uFEFF';
      const buffer = Buffer.from(bom + csvContent, 'utf-8');
      return {
        file: new StreamableFile(buffer),
        contentType: 'text/csv; charset=utf-8',
        filename: `import-issue-template.csv`,
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `import-issue-template.xlsx`;

    return {
      file: new StreamableFile(Buffer.from(buffer)),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
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

  private async buildXlsx(
    rows: string[][],
    workspaceId: string,
  ): Promise<{ file: StreamableFile; contentType: string; filename: string }> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tasks');

    worksheet.addRow(EXPORT_COLUMNS);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF263238' },
    };
    headerRow.alignment = { horizontal: 'center' };

    rows.forEach(row => {
      worksheet.addRow(row);
    });

    worksheet.columns.forEach((column, i) => {
      let maxLen = EXPORT_COLUMNS[i].length;
      rows.forEach(row => {
        if (row[i] && row[i].length > maxLen) {
          maxLen = Math.min(row[i].length, 50);
        }
      });
      column.width = maxLen + 2;
    });

    for (let i = 2; i <= Math.max(rows.length + 1, 100); i++) {
      const typeCell = worksheet.getCell(`D${i}`);
      typeCell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Task,Bug,Story,Epic"'],
      };

      const priorityCell = worksheet.getCell(`F${i}`);
      priorityCell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Lowest,Low,Medium,High,Highest"'],
      };

      const statusCell = worksheet.getCell(`E${i}`);
      statusCell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"To Do,In Progress,Done,In Process"'],
      };
    }

    // Add conditional formatting for Type (Column D in Export)
    worksheet.addConditionalFormatting({
      ref: 'D2:D1000',
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Task"'], style: { font: { color: { argb: 'FF2563EB' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Bug"'], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Story"'], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Epic"'], style: { font: { color: { argb: 'FF9333EA' }, bold: true } } },
      ] as any
    });

    // Add conditional formatting for Priority (Column F in Export)
    worksheet.addConditionalFormatting({
      ref: 'F2:F1000',
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Highest"'], style: { font: { color: { argb: 'FF8B0000' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"High"'], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Medium"'], style: { font: { color: { argb: 'FFD97706' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Low"'], style: { font: { color: { argb: 'FF2563EB' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Lowest"'], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
      ] as any
    });

    // Add conditional formatting for Status (Column E in Export)
    worksheet.addConditionalFormatting({
      ref: 'E2:E1000',
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"To do"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"To Do"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"In Process"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C6500' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"In Progress"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C6500' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Done"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' }, bold: true } } },
      ] as any
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `tasks-${workspaceId}-${this.dateStamp()}.xlsx`;

    return {
      file: new StreamableFile(Buffer.from(buffer)),
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
