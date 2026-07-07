import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class WorklogReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (ISO 8601)',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ enum: ['week', 'month', 'day'], default: 'week' })
  @IsOptional()
  @IsIn(['week', 'month', 'day'])
  groupBy?: 'week' | 'month' | 'day';

  @ApiPropertyOptional({
    description: 'Filter by user IDs (admin only). Comma-separated or array.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') return value.split(',').filter(Boolean);
    return value;
  })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter by task key (e.g. AL-42)',
    example: 'AL-42',
  })
  @IsOptional()
  @IsString()
  taskKey?: string;

  /** Timezone offset in hours (e.g., 7 for UTC+7). Defaults to 7. */
  @ApiPropertyOptional({
    description: 'Timezone offset hours (default 7)',
    example: 7,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 7))
  timezoneOffset?: number;
}
