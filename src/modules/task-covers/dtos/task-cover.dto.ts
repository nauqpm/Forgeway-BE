import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_COVER_SOURCE_VALUES,
  TASK_COVER_TYPE_VALUES,
  TaskCoverSource,
  TaskCoverType,
} from '../constants/task-cover.constants';

export class TaskCoverDto {
  @ApiProperty({ enum: TASK_COVER_TYPE_VALUES })
  type!: TaskCoverType;

  @ApiPropertyOptional()
  color?: string;

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ enum: TASK_COVER_SOURCE_VALUES })
  source?: TaskCoverSource;

  @ApiPropertyOptional()
  updatedBy?: string;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
