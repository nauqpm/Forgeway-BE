import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'EndDateAfterStartDate', async: false })
class EndDateAfterStartDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments): boolean {
    const obj = args.object as { startDate?: string };

    if (!obj.startDate || !endDate) {
      return true;
    }

    const start = new Date(obj.startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return true;
    }

    return end > start;
  }

  defaultMessage(): string {
    return 'endDate must be after startDate';
  }
}

export class CreateSprintDto {
  @ApiPropertyOptional({
    example: 'Sprint 3',
    description:
      'Sprint name. If omitted, the system can generate a default name.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Complete user authentication' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: '2026-05-21T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-04T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  @Validate(EndDateAfterStartDateConstraint)
  endDate?: string;

  @ApiPropertyOptional({ example: '2 weeks' })
  @IsOptional()
  @IsString()
  duration?: string;
}

export class UpdateSprintDto {
  @ApiPropertyOptional({ example: 'Sprint 3' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    example: 'Finish sprint planning and authentication tasks',
  })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: '2026-05-21T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-04T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  @Validate(EndDateAfterStartDateConstraint)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  duration?: string;
}

export class StartSprintDto {
  @ApiProperty({ example: '2026-05-25T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-06-08T00:00:00.000Z' })
  @IsDateString()
  @Validate(EndDateAfterStartDateConstraint)
  endDate!: string;
}

export class CompleteSprintDto {
  @ApiPropertyOptional({
    example: '606065da30a349a19b04c860',
    description:
      'Target planning sprint ID for incomplete tasks. If omitted, incomplete tasks are moved back to backlog.',
  })
  @IsOptional()
  @IsMongoId()
  moveToSprintId?: string;
}

export class MoveTasksToSprintDto {
  @ApiProperty({
    type: [String],
    example: ['606065da30a349a19b04c860'],
    description:
      'List of task/issue IDs to move into a sprint or back to backlog.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  taskIds!: string[];
}
