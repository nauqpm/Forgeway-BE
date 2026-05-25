import { IsString, IsNotEmpty, IsOptional, IsDateString, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, Validate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'EndDateAfterStartDate', async: false })
class EndDateAfterStartDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments): boolean {
    const obj = args.object as CreateSprintDto;
    if (!obj.startDate || !endDate) return true;
    return new Date(endDate) > new Date(obj.startDate as unknown as string);
  }

  defaultMessage(): string {
    return 'endDate must be after startDate';
  }
}

export class CreateSprintDto {
  @ApiProperty({ example: 'Sprint 1' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Complete user authentication' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiProperty({ example: '2026-05-21T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-06-04T00:00:00.000Z' })
  @IsDateString()
  @Validate(EndDateAfterStartDateConstraint)
  endDate!: string;

  @ApiPropertyOptional({ example: '2 weeks' })
  @IsOptional()
  @IsString()
  duration?: string;
}

export class UpdateSprintDto {
  @ApiPropertyOptional({ example: 'Sprint 2' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  duration?: string;
}
