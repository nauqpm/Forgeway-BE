import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CsvRowResultDto } from '../dtos/requests/import-csv-preview.dto';
import {
  ImportBulkResultDto,
  ImportBulkTaskResultDto,
} from '../dtos/requests/import-csv-preview.dto';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskCreateService } from './task-create.service';
import { CsvFileParserService } from './csv-file-parser.service';
import { CsvImportLookupService } from './csv-import-lookup.service';
import { CsvRowValidatorService } from './csv-row-validator.service';

const MAX_CSV_ROWS = 200;

@Injectable()
export class TaskCsvImportService {
  private readonly logger = new Logger(TaskCsvImportService.name);

  constructor(
    private readonly taskCreateService: TaskCreateService,
    private readonly jwtService: JwtService,
    private readonly csvFileParserService: CsvFileParserService,
    private readonly csvImportLookupService: CsvImportLookupService,
    private readonly csvRowValidatorService: CsvRowValidatorService,
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
    const records = this.csvFileParserService.parse(buffer, originalname);

    const maps = await this.csvImportLookupService.buildLookupMaps(
      workspaceId,
      userId,
    );

    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    const rows = records.map((rawRecord, index) => {
      const record: Record<string, string> = {};
      for (const [key, val] of Object.entries(rawRecord)) {
        record[key] = typeof val === 'string' ? val.trim() : String(val ?? '');
      }

      const result = this.csvRowValidatorService.validateRow(
        record,
        index + 2,
        maps,
      );

      if (result.status === 'error') errorCount++;
      else {
        validCount++;
        if (result.status === 'warning') warningCount++;
      }

      return result;
    });

    return { rows, validCount, errorCount, warningCount };
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
    } catch {
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
        const result = await this.taskCreateService.createInWorkspaceId(
          workspaceId,
          row,
          userId,
        );
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

    return { created: createdCount, failed: failedCount, results };
  }
}
