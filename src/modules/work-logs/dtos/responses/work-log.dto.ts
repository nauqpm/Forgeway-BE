import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty()
  taskKey!: string;

  @ApiProperty()
  loggedBy!: string;

  /** Số giờ đã log trong lần này */
  @ApiProperty({ description: 'Hours spent in this log session', example: 4.5 })
  hoursSpent!: number;

  @ApiPropertyOptional({ description: 'Work description (Markdown supported)' })
  description?: string;

  @ApiProperty({ description: 'Actual date/time the work was done' })
  loggedAt!: Date;

  @ApiProperty()
  createdAt!: Date;
}

export class WorkLogListDto {
  @ApiProperty({ type: [WorkLogDto] })
  workLogs!: WorkLogDto[];

  @ApiProperty({ description: 'Total number of work log entries' })
  total!: number;

  @ApiProperty({
    description: 'Total hours logged across all entries',
    example: 8.5,
  })
  totalHours!: number;
}
