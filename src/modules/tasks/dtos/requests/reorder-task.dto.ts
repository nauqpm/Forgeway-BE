import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

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
    description:
      'Rank scope used for ordering. Board reorder is scoped by column; sprint reorder is scoped by sprint/backlog list.',
    enum: ['board', 'sprint'],
    default: 'board',
  })
  @IsOptional()
  @IsIn(['board', 'sprint'])
  rankScope?: 'board' | 'sprint';

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
