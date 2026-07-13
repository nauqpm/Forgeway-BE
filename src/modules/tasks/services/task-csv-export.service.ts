import {
  Injectable,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import * as ExcelJS from 'exceljs';
import { TaskReadRepository } from '../repositories/task-read.repository';
import {
  ExportTasksDto,
  ExportFormat,
} from '../dtos/requests/export-tasks.dto';
import { TaskDocument } from '../schemas/task.schema';
import { TaskWordExportService } from './task-word-export.service';
import { TaskExportLookupService } from './task-export-lookup.service';
import { TaskExportRowMapperService } from './task-export-row-mapper.service';

const MAX_EXPORT_ROWS = 10000;

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

@Injectable()
export class TaskCsvExportService {
  constructor(
    private readonly tasksRepository: TaskReadRepository,
    private readonly taskWordExportService: TaskWordExportService,
    private readonly taskExportLookupService: TaskExportLookupService,
    private readonly taskExportRowMapperService: TaskExportRowMapperService,
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

    const resolved = await this.taskExportLookupService.resolve(
      workspaceId,
      userId,
      tasks,
    );

    const rows = tasks.map(task =>
      this.taskExportRowMapperService.toRow(
        task,
        resolved,
        baseUrl,
        workspaceId,
      ),
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

    worksheet.addConditionalFormatting({
      ref: 'C2:C1000',
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Task"'],
          style: { font: { color: { argb: 'FF2563EB' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Bug"'],
          style: { font: { color: { argb: 'FFDC2626' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Story"'],
          style: { font: { color: { argb: 'FF16A34A' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Epic"'],
          style: { font: { color: { argb: 'FF9333EA' }, bold: true } },
        },
      ] as any,
    });

    worksheet.addConditionalFormatting({
      ref: 'D2:D1000',
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Highest"'],
          style: { font: { color: { argb: 'FF8B0000' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"High"'],
          style: { font: { color: { argb: 'FFDC2626' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Medium"'],
          style: { font: { color: { argb: 'FFD97706' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Low"'],
          style: { font: { color: { argb: 'FF2563EB' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Lowest"'],
          style: { font: { color: { argb: 'FF16A34A' }, bold: true } },
        },
      ] as any,
    });

    worksheet.addConditionalFormatting({
      ref: 'E2:E1000',
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"To do"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFC7CE' },
            },
            font: { color: { argb: 'FF9C0006' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"To Do"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFC7CE' },
            },
            font: { color: { argb: 'FF9C0006' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"In Process"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFEB9C' },
            },
            font: { color: { argb: 'FF9C6500' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"In Progress"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFEB9C' },
            },
            font: { color: { argb: 'FF9C6500' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Done"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFC6EFCE' },
            },
            font: { color: { argb: 'FF006100' }, bold: true },
          },
        },
      ] as any,
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
    return {
      file: new StreamableFile(Buffer.from(buffer)),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `import-issue-template.xlsx`,
    };
  }

  private async queryTasks(
    workspaceId: string,
    dto: ExportTasksDto,
  ): Promise<TaskDocument[]> {
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

  private buildCsv(
    rows: string[][],
    workspaceId: string,
  ): { file: StreamableFile; contentType: string; filename: string } {
    const csvContent = stringify([EXPORT_COLUMNS, ...rows]);
    const bom = '\uFEFF';
    const buffer = Buffer.from(bom + csvContent, 'utf-8');
    const filename = `tasks-${workspaceId}-${this.taskExportRowMapperService.dateStamp()}.csv`;

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
      worksheet.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Task,Bug,Story,Epic"'],
      };
      worksheet.getCell(`F${i}`).dataValidation = {
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

    worksheet.addConditionalFormatting({
      ref: 'D2:D1000',
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Task"'],
          style: { font: { color: { argb: 'FF2563EB' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Bug"'],
          style: { font: { color: { argb: 'FFDC2626' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Story"'],
          style: { font: { color: { argb: 'FF16A34A' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Epic"'],
          style: { font: { color: { argb: 'FF9333EA' }, bold: true } },
        },
      ] as any,
    });

    worksheet.addConditionalFormatting({
      ref: 'F2:F1000',
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Highest"'],
          style: { font: { color: { argb: 'FF8B0000' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"High"'],
          style: { font: { color: { argb: 'FFDC2626' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Medium"'],
          style: { font: { color: { argb: 'FFD97706' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Low"'],
          style: { font: { color: { argb: 'FF2563EB' }, bold: true } },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Lowest"'],
          style: { font: { color: { argb: 'FF16A34A' }, bold: true } },
        },
      ] as any,
    });

    worksheet.addConditionalFormatting({
      ref: 'E2:E1000',
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"To do"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFC7CE' },
            },
            font: { color: { argb: 'FF9C0006' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"To Do"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFC7CE' },
            },
            font: { color: { argb: 'FF9C0006' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"In Process"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFEB9C' },
            },
            font: { color: { argb: 'FF9C6500' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"In Progress"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFEB9C' },
            },
            font: { color: { argb: 'FF9C6500' }, bold: true },
          },
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"Done"'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFC6EFCE' },
            },
            font: { color: { argb: 'FF006100' }, bold: true },
          },
        },
      ] as any,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `tasks-${workspaceId}-${this.taskExportRowMapperService.dateStamp()}.xlsx`;

    return {
      file: new StreamableFile(Buffer.from(buffer)),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }
}
