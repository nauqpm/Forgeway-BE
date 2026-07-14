import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';
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
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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

  async createSessionToken(
    rows: CsvRowResultDto[],
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    const validRows = rows
      .filter(r => r.status !== 'error')
      .map(r => ({ rowIndex: r.rowIndex, data: r.data }));
    const nonce = randomUUID();

    // Store nonce in cache for 15 minutes (900,000 ms)
    await this.cacheManager.set(`import_session:${nonce}`, 1, 900_000);

    return this.jwtService.sign({
      workspaceId,
      userId,
      purpose: 'csv_import',
      nonce,
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
      nonce?: string;
      rows?: { rowIndex: number; data: CreateTaskDto }[];
    };

    try {
      payload = this.jwtService.verify(sessionToken);
    } catch {
      throw new UnauthorizedException(
        'Import session expired or invalid. Please re-upload the file.',
      );
    }

    if (
      payload.workspaceId !== workspaceId ||
      payload.userId !== userId ||
      payload.purpose !== 'csv_import' ||
      !payload.nonce
    ) {
      throw new UnauthorizedException('Invalid import token.');
    }

    const nonceKey = `import_session:${payload.nonce}`;
    const nonceExists = await this.cacheManager.get(nonceKey);
    if (!nonceExists) {
      throw new UnauthorizedException(
        'Import session has already been consumed or expired.',
      );
    }
    await this.cacheManager.del(nonceKey);

    const rowsToCreate = payload.rows || [];

    if (!Array.isArray(rowsToCreate) || rowsToCreate.length > MAX_CSV_ROWS) {
      throw new BadRequestException('Token data is invalid or too large.');
    }

    const results: ImportBulkTaskResultDto[] = [];
    let createdCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rowsToCreate.length; i++) {
      const { rowIndex, data: row } = rowsToCreate[i];
      try {
        const result = await this.taskCreateService.createInWorkspaceId(
          workspaceId,
          row,
          userId,
        );
        createdCount++;
        results.push({
          rowIndex,
          title: row.title,
          status: 'created',
          taskKey: result.key,
        });
      } catch (error) {
        failedCount++;
        results.push({
          rowIndex,
          title: row.title,
          status: 'failed',
          error: (error as Error)?.message || 'Unknown error',
        });
      }
    }

    return { created: createdCount, failed: failedCount, results };
  }
}
