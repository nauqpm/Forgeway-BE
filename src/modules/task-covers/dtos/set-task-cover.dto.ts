import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  TASK_COVER_COLOR_PATTERN,
  TASK_COVER_SOURCE_VALUES,
  TASK_COVER_TYPE_VALUES,
  TASK_COVER_TYPES,
  TaskCoverSource,
  TaskCoverType,
} from '../constants/task-cover.constants';

export class SetTaskCoverDto {
  @ApiProperty({
    enum: TASK_COVER_TYPE_VALUES,
    example: TASK_COVER_TYPES.COLOR,
  })
  @IsEnum(TASK_COVER_TYPE_VALUES)
  type!: TaskCoverType;

  @ApiPropertyOptional({ example: '#0052CC' })
  @ValidateIf(dto => dto.type === TASK_COVER_TYPES.COLOR)
  @IsString()
  @Matches(TASK_COVER_COLOR_PATTERN, {
    message: 'color must be a valid hex color',
  })
  color?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-example' })
  @ValidateIf(dto => dto.type === TASK_COVER_TYPES.IMAGE)
  @IsUrl({ require_protocol: true })
  imageUrl?: string;

  @ApiPropertyOptional({ enum: TASK_COVER_SOURCE_VALUES, example: 'unsplash' })
  @IsOptional()
  @IsEnum(TASK_COVER_SOURCE_VALUES)
  source?: TaskCoverSource;
}
