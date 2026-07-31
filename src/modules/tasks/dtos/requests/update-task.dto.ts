import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  MaxLength,
  Min,
  Max,
  IsMongoId,
  ValidateIf,
} from 'class-validator';
import { MAX_COLUMN_NAME_LENGTH } from '@/common/constants/column.constants';
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
  @MaxLength(MAX_COLUMN_NAME_LENGTH)
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
  @Max(100)
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

  @ApiPropertyOptional({
    description: 'Parent task ID. Set null to unlink (convert subtask to task)',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(o => o.parentId !== null)
  @IsMongoId()
  parentId?: string | null;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999)
  timeLogged?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9999)
  timeEstimated?: number;
}
