import { Injectable, BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import * as xlsx from 'xlsx';

const MAX_CSV_ROWS = 200;

@Injectable()
export class CsvFileParserService {
  parse(buffer: Buffer, originalname?: string): Record<string, string>[] {
    const isExcel = !!originalname?.match(/\.(xlsx|xls)$/i);

    if (isExcel) {
      return this.parseExcel(buffer);
    }

    const content = this.decodeBuffer(buffer);
    return this.parseCsv(content);
  }

  private decodeBuffer(buffer: Buffer): string {
    const detected = jschardet.detect(buffer);
    let encoding = detected.encoding
      ? detected.encoding.toLowerCase()
      : 'utf-8';

    if (encoding === 'windows-1252' || encoding === 'iso-8859-1') {
      encoding = 'windows-1258';
    }

    let content: string;
    try {
      content = iconv.encodingExists(encoding)
        ? iconv.decode(buffer, encoding)
        : iconv.decode(buffer, 'utf-8');
    } catch {
      content = iconv.decode(buffer, 'utf-8');
    }

    if (content.includes('\uFFFD')) {
      content = iconv.decode(buffer, 'windows-1258');
    }

    return content;
  }

  private parseCsv(content: string): Record<string, string>[] {
    let records: Record<string, string>[];
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
      });
    } catch (err) {
      throw new BadRequestException(
        `CSV parsing error: ${(err as Error).message}`,
      );
    }

    this.assertRowLimits(records.length, 'CSV');
    return records;
  }

  private parseExcel(buffer: Buffer): Record<string, string>[] {
    let records: Record<string, string>[];
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      records = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
    } catch (err) {
      throw new BadRequestException(
        `Excel parsing error: ${(err as Error).message}`,
      );
    }

    this.assertRowLimits(records.length, 'Excel');
    return records;
  }

  private assertRowLimits(count: number, fileType: string): void {
    if (count === 0) {
      throw new BadRequestException(
        `The ${fileType} file contains no data (0 rows).`,
      );
    }
    if (count > MAX_CSV_ROWS) {
      throw new BadRequestException(
        `File is too large. Maximum allowed is ${MAX_CSV_ROWS} rows.`,
      );
    }
  }
}
