import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  MaxLength,
  Min,
  IsMongoId,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../../constants/task-status.constants';

export class CreateTaskDto {
  @ApiProperty({ example: 'Implement login feature' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    enum: TASK_TYPES,
    default: 'task',
  })
  @IsOptional()
  @IsEnum(TASK_TYPES)
  type?: string;

  @ApiPropertyOptional({ example: '664f1f2a7bc2f8d3e9a12345' })
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

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  storyPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  epicId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export { UpdateTaskDto } from './update-task.dto';
export { FilterTaskDto } from './filter-task.dto';
