import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KanbanBoardColumnDto {
  @ApiProperty({ example: 'todo' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'To Do' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  order!: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  wipLimit?: number;

  @ApiProperty({ example: ['todo', 'open'] })
  @IsArray()
  @IsString({ each: true })
  mappedStatuses!: string[];
}

export class CreateKanbanBoardDto {
  @ApiProperty({ example: 'Main Board' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '664a4b7b6f6e3a2a8c5d9f01' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({ type: [KanbanBoardColumnDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KanbanBoardColumnDto)
  columns?: KanbanBoardColumnDto[];

  @ApiPropertyOptional({ enum: ['kanban', 'scrum'], default: 'kanban' })
  @IsOptional()
  @IsString()
  type?: string;
}
