import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsMongoId,
  IsBoolean,
  IsIn,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_KEY_PATTERN,
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../../constants/task-status.constants';
import { normalizeTaskKey } from '../../utils/task-key.util';

const normalizeStatusFilter = (value: unknown): string[] | undefined => {
  const values = Array.isArray(value) ? value : [value];
  const statuses = values
    .flatMap(item => String(item ?? '').split(','))
    .map(item => item.trim())
    .filter(Boolean);

  return statuses.length > 0 ? statuses : undefined;
};

const normalizeIdListFilter = (value: unknown): string[] | undefined => {
  const values = Array.isArray(value) ? value : [value];
  const ids = values
    .flatMap(item => String(item ?? '').split(','))
    .map(item => item.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : undefined;
};

export class FilterTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  sprintId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  boardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  columnId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  reporterId?: string;

  @ApiPropertyOptional({
    description:
      'Filter tasks that contain all provided label IDs. Supports labelIds=id1,id2 or repeated labelIds query params.',
    oneOf: [
      { type: 'string', example: '665c0a8c3a9b1d6d9c000001' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  @IsOptional()
  @Transform(({ value }) => normalizeIdListFilter(value))
  @IsMongoId({ each: true })
  labelIds?: string[];
  @ApiPropertyOptional({
    description: 'Exact task key lookup within the resolved workspace.',
    example: 'TESKB-12',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeTaskKey(value))
  @Matches(TASK_KEY_PATTERN, {
    message: 'taskKey must match format like TESKB-12',
  })
  taskKey?: string;

  @ApiPropertyOptional({ enum: TASK_TYPES })
  @IsOptional()
  @IsEnum(TASK_TYPES)
  type?: string;

  @ApiPropertyOptional({
    description:
      'Single status or multi-select statuses. Supports status=todo,inprogress or repeated status query params.',
    oneOf: [
      { type: 'string', example: 'todo' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['todo', 'inprogress', 'testing'],
      },
    ],
  })
  @IsOptional()
  @Transform(({ value }) => normalizeStatusFilter(value))
  @IsString({ each: true })
  status?: string[];

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  backlog?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: [
      'createdAt',
      'updatedAt',
      'key',
      'priority',
      'status',
      'rank',
      'archivedAt',
      'dueDate',
    ],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'createdAt',
    'updatedAt',
    'key',
    'priority',
    'status',
    'rank',
    'archivedAt',
    'dueDate',
  ])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
