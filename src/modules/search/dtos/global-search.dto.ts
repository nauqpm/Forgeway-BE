import { Transform, Type } from 'class-transformer';
import {
  IsBase64,
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const GLOBAL_SEARCH_TYPES = [
  'task',
  'page',
  'comment',
  'workspace',
  'board',
  'sprint',
  'user',
] as const;
export type GlobalSearchType = (typeof GLOBAL_SEARCH_TYPES)[number];

export type GlobalSearchItem = {
  id: string;
  type: GlobalSearchType;
  title: string;
  description?: string;
  key?: string;
  url: string;
  workspaceId?: string;
  workspaceName?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const splitValues = (value: unknown): string[] | undefined => {
  const values = (Array.isArray(value) ? value : [value])
    .flatMap(item => String(item ?? '').split(','))
    .map(item => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
};

export class GlobalSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(256)
  @Transform(({ value }) => String(value ?? '').trim())
  q!: string;

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsIn(GLOBAL_SEARCH_TYPES, { each: true })
  types?: GlobalSearchType[];

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsMongoId({ each: true })
  workspaceIds?: string[];

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsMongoId({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsMongoId({ each: true })
  authorIds?: string[];

  @IsOptional()
  @IsMongoId()
  reporterId?: string;

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsString({ each: true })
  status?: string[];

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsString({ each: true })
  taskType?: string[];

  @IsOptional()
  @Transform(({ value }) => splitValues(value))
  @IsString({ each: true })
  priority?: string[];

  @IsOptional()
  @IsDateString()
  updatedAfter?: string;

  @IsOptional()
  @IsDateString()
  updatedBefore?: string;

  @IsOptional()
  @IsBase64()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}
