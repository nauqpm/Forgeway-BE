import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiPropertyOptional()
  sprintId?: string;

  @ApiPropertyOptional()
  boardId?: string;

  @ApiPropertyOptional()
  columnId?: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  priority!: string;

  @ApiPropertyOptional()
  assigneeId?: string;

  @ApiProperty()
  reporterId!: string;

  @ApiPropertyOptional()
  storyPoints?: number;

  @ApiPropertyOptional()
  dueDate?: Date;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}

export class TaskListDto {
  @ApiProperty({ type: [TaskDto] })
  tasks!: TaskDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
