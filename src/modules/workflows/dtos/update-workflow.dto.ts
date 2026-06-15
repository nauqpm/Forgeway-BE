import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  WorkflowStatusDto,
  WorkflowTransitionDto,
} from './create-workflow.dto';

export { WorkflowStatusDto, WorkflowTransitionDto };

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultStatus?: string;

  @ApiPropertyOptional({ type: [WorkflowStatusDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStatusDto)
  statuses?: WorkflowStatusDto[];

  @ApiPropertyOptional({ type: [WorkflowTransitionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTransitionDto)
  transitions?: WorkflowTransitionDto[];
}
