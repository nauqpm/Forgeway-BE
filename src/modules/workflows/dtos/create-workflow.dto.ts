import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_COLUMN_NAME_LENGTH } from '@/common/constants/column.constants';

export class WorkflowStatusDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_COLUMN_NAME_LENGTH)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ enum: ['todo', 'inprogress', 'done'] })
  @IsOptional()
  @IsEnum(['todo', 'inprogress', 'done'])
  category?: string;

  @ApiPropertyOptional({ enum: ['review'] })
  @IsOptional()
  @IsEnum(['review'])
  requirementsGate?: 'review';
}

export class WorkflowTransitionDto {
  @ApiProperty()
  @IsString()
  fromStatus!: string;

  @ApiProperty()
  @IsString()
  toStatus!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  conditions?: Record<string, any>;
}

export class CreateWorkflowDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @IsString()
  defaultStatus!: string;

  @ApiProperty({ type: [WorkflowStatusDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStatusDto)
  statuses!: WorkflowStatusDto[];

  @ApiPropertyOptional({ type: [WorkflowTransitionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTransitionDto)
  transitions?: WorkflowTransitionDto[];
}
