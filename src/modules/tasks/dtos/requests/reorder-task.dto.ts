import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, ValidateIf } from 'class-validator';

const emptyStringToNull = (value: unknown): unknown => {
  if (value === '') {
    return null;
  }

  return value;
};

export class ReorderTaskDto {
  @ApiPropertyOptional({ example: 'inprogress' })
  @IsOptional()
  @IsString()
  columnId?: string;

  @ApiPropertyOptional({ example: 'inprogress' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Sprint ID to assign, or null to place the task in backlog.',
    nullable: true,
  })
  @Transform(({ value }) => emptyStringToNull(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsMongoId()
  sprintId?: string | null;

  @ApiPropertyOptional({
    description: 'Task ID currently below the reordered task.',
  })
  @IsOptional()
  @IsMongoId()
  beforeTaskId?: string;

  @ApiPropertyOptional({
    description: 'Task ID currently above the reordered task.',
  })
  @IsOptional()
  @IsMongoId()
  afterTaskId?: string;
}
