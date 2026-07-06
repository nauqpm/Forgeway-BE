import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateWorkLogDto {
  @ApiPropertyOptional({
    description: 'Hours spent to update for this log',
    example: 2.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursSpent?: number;

  @ApiPropertyOptional({
    description: 'Updated work description (Markdown supported)',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated actual date/time the work was done',
  })
  @IsOptional()
  @IsString()
  loggedAt?: string;

  @ApiPropertyOptional({
    description: 'Updated remaining time estimation (e.g. "4h", "2d")',
  })
  @IsOptional()
  @IsString()
  timeEstimated?: string;
}
