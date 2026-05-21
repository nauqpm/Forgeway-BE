import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  startDate!: Date;

  @ApiProperty({ example: '2026-06-04T00:00:00.000Z' })
  @IsDateString()
  endDate!: Date;
}

export class UpdateSprintDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @ApiPropertyOptional({ enum: ['planning', 'active', 'completed'] })
  @IsOptional()
  @IsString()
  status?: string;
}
