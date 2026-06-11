import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  ValidateIf,
  IsInt,
  Min,
} from 'class-validator';
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

// ─── Column CRUD DTOs ────────────────────────────────────────

export class CreateColumnDto {
  @ApiProperty({ example: 'In Review', description: 'Tên column mới' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateColumnDto {
  @ApiPropertyOptional({
    example: 'Code Review',
    description: 'Tên column mới',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    example: ['in-review', 'review'],
    description: 'Danh sách status được ánh xạ',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mappedStatuses?: string[];
}

export class UpdateWipLimitDto {
  @ApiPropertyOptional({
    example: 5,
    description: 'Giới hạn WIP cho column. Truyền null để xóa giới hạn.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  wipLimit?: number | null;
}

export class MoveColumnDto {
  @ApiPropertyOptional({
    example: 2,
    description: 'Vị trí index mới (0-based)',
  })
  @ValidateIf((o: MoveColumnDto) => o.afterColumnId === undefined)
  @IsInt()
  @Min(0)
  targetIndex?: number;

  @ApiPropertyOptional({
    example: 'abc123',
    description: 'Chèn sau column này. Truyền null để đưa lên đầu.',
    nullable: true,
  })
  @ValidateIf((o: MoveColumnDto) => o.targetIndex === undefined)
  @IsString()
  afterColumnId?: string | null;
}

export class DeleteColumnDto {
  @ApiPropertyOptional({
    example: 'col-xyz',
    description:
      'Column nhận task khi xóa. Bắt buộc nếu column hiện tại còn task.',
  })
  @IsOptional()
  @IsString()
  targetColumnId?: string;
}
