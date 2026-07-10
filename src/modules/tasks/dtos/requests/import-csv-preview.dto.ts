import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CsvRowResultDto {
  @ApiProperty({ description: 'Số thứ tự dòng trong file (1-based)' })
  rowIndex!: number;

  @ApiProperty({ description: 'Tiêu đề issue (từ cột title)' })
  title!: string;

  @ApiProperty({
    enum: ['valid', 'error', 'warning'],
    description:
      'valid = sẽ tạo, error = bị bỏ qua, warning = tạo nhưng có cảnh báo',
  })
  status!: 'valid' | 'error' | 'warning';

  @ApiProperty({ type: [String], description: 'Danh sách lỗi chặn tạo task' })
  errors!: string[];

  @ApiProperty({
    type: [String],
    description: 'Danh sách cảnh báo (vẫn tạo nhưng thông báo user)',
  })
  warnings!: string[];

  @ApiPropertyOptional({
    description: 'Dữ liệu đã normalize để FE render preview',
  })
  data?: Record<string, unknown>;
}

export class ImportCsvPreviewResponseDto {
  @ApiProperty({
    description: 'JWT session token (TTL 10 phút) dùng cho bước confirm',
  })
  sessionToken!: string;

  @ApiProperty()
  totalRows!: number;

  @ApiProperty({ description: 'Số dòng sẽ được tạo (valid + warning)' })
  validCount!: number;

  @ApiProperty({ description: 'Số dòng bị bỏ qua (có error)' })
  errorCount!: number;

  @ApiProperty({ description: 'Số dòng có warning (vẫn được tạo)' })
  warningCount!: number;

  @ApiProperty({ type: [CsvRowResultDto] })
  rows!: CsvRowResultDto[];
}

export class ImportBulkTaskResultDto {
  @ApiProperty()
  rowIndex!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['created', 'failed'] })
  status!: 'created' | 'failed';

  @ApiPropertyOptional()
  taskKey?: string;

  @ApiPropertyOptional()
  error?: string;
}

export class ImportBulkResultDto {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({ type: [ImportBulkTaskResultDto] })
  results!: ImportBulkTaskResultDto[];
}
