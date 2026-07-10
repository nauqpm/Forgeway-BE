import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import * as xlsx from 'xlsx';
import { TaskCreateService } from './task-create.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { UsersService } from '../../users/services/users.service';
import {
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../constants/task-status.constants';
import { CsvRowResultDto } from '../dtos/requests/import-csv-preview.dto';
import {
  ImportBulkResultDto,
  ImportBulkTaskResultDto,
} from '../dtos/requests/import-csv-preview.dto';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';

const MAX_CSV_ROWS = 200;

@Injectable()
export class TaskCsvImportService {
  private readonly logger = new Logger(TaskCsvImportService.name);

  constructor(
    private readonly taskCreateService: TaskCreateService,
    private readonly workspacesService: WorkspacesService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async parseAndValidateCsv(
    buffer: Buffer,
    workspaceId: string,
    userId: string,
    originalname?: string,
  ): Promise<{
    rows: CsvRowResultDto[];
    validCount: number;
    errorCount: number;
    warningCount: number;
  }> {
    const detected = jschardet.detect(buffer);
    let encoding = detected.encoding
      ? detected.encoding.toLowerCase()
      : 'utf-8';

    if (encoding === 'windows-1252' || encoding === 'iso-8859-1') {
      encoding = 'windows-1258';
    }

    let content = '';

    try {
      if (iconv.encodingExists(encoding)) {
        content = iconv.decode(buffer, encoding);
      } else {
        content = iconv.decode(buffer, 'utf-8');
      }
    } catch (_e) {
      content = iconv.decode(buffer, 'utf-8');
    }

    if (content.includes('\uFFFD')) {
      content = iconv.decode(buffer, 'windows-1258');
    }

    let records: Record<string, string>[];
    const isExcel = originalname && originalname.match(/\.(xlsx|xls)$/i);

    try {
      if (isExcel) {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        records = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
      } else {
        records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          relax_quotes: true,
          relax_column_count: true,
        });
      }
    } catch (err) {
      const error = err as Error;
      throw new BadRequestException(
        `Lỗi parse ${isExcel ? 'Excel' : 'CSV'}: ` + error.message,
      );
    }

    if (records.length === 0) {
      throw new BadRequestException('File không có dữ liệu (0 dòng).');
    }

    if (records.length > MAX_CSV_ROWS) {
      throw new BadRequestException(
        `File quá lớn. Tối đa cho phép ${MAX_CSV_ROWS} dòng.`,
      );
    }

    const workspace = await this.workspacesService.findById(workspaceId);
    if (!workspace) {
      throw new BadRequestException('Workspace không tồn tại');
    }

    const workspaceMemberIds = workspace.members.map(m => m.userId.toString());
    const userResults = await Promise.allSettled(
      workspaceMemberIds.map(id => this.usersService.getUserById(id)),
    );
    const users = userResults
      .filter(
        (
          res,
        ): res is PromiseFulfilledResult<{
          _id: string | { toString(): string };
          email: string;
        }> => res.status === 'fulfilled',
      )
      .map(res => res.value);

    const userEmailMap = new Map<string, string>();
    for (const u of users) {
      if (u && u.email) {
        userEmailMap.set(u.email.toLowerCase(), u._id.toString());
      }
    }

    const rowResults: CsvRowResultDto[] = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (const [index, record] of records.entries()) {
      for (const key of Object.keys(record)) {
        if (typeof record[key] === 'string') {
          record[key] = record[key].trim();
        }
      }

      const rowIndex = index + 2;
      const errors: string[] = [];
      const warnings: string[] = [];

      const title = record['Title'] || record['title'] || '';
      if (!title) {
        errors.push('Tiêu đề (title) không được để trống.');
      } else if (title.length > 255) {
        errors.push('Tiêu đề (title) vượt quá 255 ký tự.');
      }

      const type = (record['Type'] || record['type'] || 'task').toLowerCase();
      if (!TASK_TYPES.includes(type as any)) {
        errors.push(
          `Loại task (type) không hợp lệ. Phải là: ${TASK_TYPES.join(', ')}.`,
        );
      }

      const priority = (record['Priority'] || record['priority'] || 'medium').toLowerCase();
      if (!TASK_PRIORITIES.includes(priority as any)) {
        errors.push(
          `Độ ưu tiên (priority) không hợp lệ. Phải là: ${TASK_PRIORITIES.join(', ')}.`,
        );
      }

      const assigneeEmailRaw = record['Assignee Email'] || record['assigneeEmail'];
      const assigneeEmail = assigneeEmailRaw
        ? assigneeEmailRaw.trim().toLowerCase()
        : '';
      let assigneeId: string | undefined;

      if (assigneeEmail) {
        assigneeId = userEmailMap.get(assigneeEmail);
        if (!assigneeId) {
          warnings.push(
            `Email '${assigneeEmail}' không thuộc workspace. Assignee sẽ được để trống.`,
          );
        }
      }

      const storyPointsStr = record['Story Points'] || record['storyPoints'];
      let storyPoints: number | undefined;
      if (storyPointsStr) {
        storyPoints = parseFloat(storyPointsStr);
        if (isNaN(storyPoints) || storyPoints < 0 || storyPoints > 100) {
          errors.push('Story points phải là số hợp lệ từ 0 đến 100.');
        }
      }

      let parsedStartDate: string | undefined;
      const startDateRaw = record['Start Date'] || record['startDate'];
      if (startDateRaw) {
        const d = new Date(startDateRaw);
        if (isNaN(d.getTime())) {
          errors.push('Ngày bắt đầu (startDate) không đúng định dạng hợp lệ.');
        } else {
          parsedStartDate = d.toISOString();
        }
      }

      let parsedDueDate: string | undefined;
      const dueDateRaw = record['Due Date'] || record['dueDate'];
      if (dueDateRaw) {
        const d = new Date(dueDateRaw);
        if (isNaN(d.getTime())) {
          errors.push('Ngày đến hạn (dueDate) không đúng định dạng hợp lệ.');
        } else {
          parsedDueDate = d.toISOString();
        }
      }

      let status = 'valid';
      if (errors.length > 0) {
        status = 'error';
        errorCount++;
      } else if (warnings.length > 0) {
        status = 'warning';
        warningCount++;
        validCount++;
      } else {
        validCount++;
      }

      const description = record['Description'] || record['description'] || '';
      if (description.length > 5000) {
        errors.push('Mô tả (description) vượt quá 5000 ký tự.');
      }

      const data: Partial<CreateTaskDto> = {
        title,
        description,
        type,
        priority,
        status: record['Status'] || record['status'] ? (record['Status'] || record['status']).trim() : 'todo',
      };

      if (assigneeId) {
        data.assigneeId = assigneeId;
      }
      if (storyPoints !== undefined) {
        data.storyPoints = storyPoints;
      }
      if (parsedStartDate) {
        data.startDate = parsedStartDate;
      }
      if (parsedDueDate) {
        data.dueDate = parsedDueDate;
      }

      rowResults.push({
        rowIndex,
        title,
        status: status as 'valid' | 'error' | 'warning',
        errors,
        warnings,
        data,
      });
    }

    return {
      rows: rowResults,
      validCount,
      errorCount,
      warningCount,
    };
  }

  createSessionToken(
    rows: CsvRowResultDto[],
    workspaceId: string,
    userId: string,
  ): string {
    const validRows = rows.filter(r => r.status !== 'error').map(r => r.data);

    return this.jwtService.sign({
      workspaceId,
      userId,
      purpose: 'csv_import',
      rows: validRows,
    });
  }

  async importBulk(
    sessionToken: string,
    workspaceId: string,
    userId: string,
  ): Promise<ImportBulkResultDto> {
    let payload: {
      workspaceId?: string;
      userId?: string;
      purpose?: string;
      rows?: CreateTaskDto[];
    };
    try {
      payload = this.jwtService.verify(sessionToken);
    } catch (_e) {
      throw new UnauthorizedException(
        'Phiên import đã hết hạn hoặc không hợp lệ. Vui lòng upload lại file.',
      );
    }

    if (
      payload.workspaceId !== workspaceId ||
      payload.userId !== userId ||
      payload.purpose !== 'csv_import'
    ) {
      throw new UnauthorizedException('Token import không hợp lệ.');
    }

    const rowsToCreate: CreateTaskDto[] = payload.rows || [];

    if (!Array.isArray(rowsToCreate) || rowsToCreate.length > MAX_CSV_ROWS) {
      throw new BadRequestException('Dữ liệu token không hợp lệ hoặc quá lớn.');
    }

    const results: ImportBulkTaskResultDto[] = [];
    let createdCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rowsToCreate.length; i++) {
      const row = rowsToCreate[i];
      try {
        const result = await this.taskCreateService.createInWorkspaceId(workspaceId, row, userId);
        createdCount++;
        results.push({
          rowIndex: i,
          title: row.title,
          status: 'created',
          taskKey: result.key,
        });
      } catch (error) {
        failedCount++;
        results.push({
          rowIndex: i,
          title: row.title,
          status: 'failed',
          error: (error as Error)?.message || 'Lỗi không xác định',
        });
      }
    }

    return {
      created: createdCount,
      failed: failedCount,
      results,
    };
  }
}
