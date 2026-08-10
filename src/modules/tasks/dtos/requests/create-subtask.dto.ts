import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_PRIORITIES,
  TaskPriority,
} from '../../constants/task-status.constants';

/**
 * DTO for creating a subtask.
 * Subtask does not support: storyPoints, epicId (inherited or not applicable).
 * sprintId is always inherited from parent (set by service).
 */
export class CreateSubtaskDto {
  @ApiProperty({ example: 'Write unit tests for login service' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, default: 'medium' })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Assignee user ID (can differ from parent)',
  })
  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Estimated time in hours' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9999)
  timeEstimated?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsMongoId({ each: true })
  labelIds?: string[];
}

/** DTO for converting a Task to Subtask — only needs parentId */
export class ConvertToSubtaskDto {
  @ApiProperty({ description: 'New parent task ID' })
  @IsMongoId()
  parentId!: string;
}
