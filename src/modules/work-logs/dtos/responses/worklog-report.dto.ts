import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorklogReportTaskRow {
  @ApiProperty()
  taskId!: string;

  @ApiProperty()
  taskKey!: string;

  @ApiProperty()
  taskTitle!: string;

  @ApiPropertyOptional()
  taskType?: string;

  @ApiProperty({ description: 'Total hours for this task across the period' })
  totalHours!: number;

  @ApiProperty({
    description: 'Hours broken down by each period column (key = period label)',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  periodHours!: Record<string, number>;
}

export class WorklogReportUserRow {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  userName!: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty({ description: 'Total hours for this user across the period' })
  totalHours!: number;

  @ApiProperty({ type: [WorklogReportTaskRow] })
  tasks!: WorklogReportTaskRow[];
}

export class WorklogReportDto {
  @ApiProperty({ description: 'List of period column labels', type: [String] })
  periods!: string[];

  @ApiProperty({ type: [WorklogReportUserRow] })
  users!: WorklogReportUserRow[];

  @ApiProperty({ description: 'Total hours across all users' })
  grandTotalHours!: number;
}
