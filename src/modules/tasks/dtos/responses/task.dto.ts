import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TaskAttachmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  uploadedAt!: Date;
}

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
  boardColumnId?: string;

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

  @ApiProperty({ type: [String] })
  labels!: string[];

  @ApiProperty({ type: [TaskAttachmentResponseDto] })
  attachments!: TaskAttachmentResponseDto[];

  @ApiPropertyOptional()
  storyPoints?: number;

  @ApiPropertyOptional()
  dueDate?: Date;

  @ApiPropertyOptional()
  parentId?: string;

  @ApiPropertyOptional()
  epicId?: string;

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
