import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId, IsString } from 'class-validator';

export class AssignTaskDto {
  @ApiProperty({ example: '664f1f2a7bc2f8d3e9a12345' })
  @IsMongoId()
  userId!: string;
}

export class ChangeTaskStatusDto {
  @ApiProperty({ example: 'inprogress' })
  @IsString()
  status!: string;
}

export class MoveTaskToKanbanColumnDto {
  @ApiProperty({ example: '664a4b7b6f6e3a2a8c5d9f01' })
  @IsMongoId()
  kanbanBoardId!: string;

  @ApiProperty({ example: 'inprogress' })
  @IsString()
  columnId!: string;
}

export class UpdateTaskLabelsDto {
  @ApiProperty({ example: ['frontend', 'urgent'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  labels!: string[];
}
