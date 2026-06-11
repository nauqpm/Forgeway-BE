import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, ValidateIf } from 'class-validator';

const emptyStringToNull = (value: unknown): unknown => {
  if (value === '') {
    return null;
  }

  return value;
};

export class MoveTaskDto {
  @ApiPropertyOptional({ example: 'inprogress' })
  @IsOptional()
  @IsString()
  columnId?: string;

  @ApiPropertyOptional({ example: 'inprogress' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Sprint ID to assign, or null to move the task back to backlog.',
    nullable: true,
  })
  @Transform(({ value }) => emptyStringToNull(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsMongoId()
  sprintId?: string | null;

  @ApiPropertyOptional({
    description: 'Future ordering rank. Kept optional for DnD ordering.',
    example: '0|hzzt:',
  })
  @IsOptional()
  @IsString()
  rank?: string;
}
