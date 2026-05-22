import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../../constants/task-status.constants';

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

  @ApiPropertyOptional({ enum: TASK_TYPES })
  @IsOptional()
  @IsEnum(TASK_TYPES)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

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
}
