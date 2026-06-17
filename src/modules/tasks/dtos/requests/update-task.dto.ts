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
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../../constants/task-status.constants';

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

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
  @IsMongoId()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  storyPoints?: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(o => o.startDate !== null)
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(o => o.dueDate !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  epicId?: string;

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
}
