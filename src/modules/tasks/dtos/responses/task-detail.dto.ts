import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskLabelSummaryDto, TaskUserSummaryDto } from './task.dto';

export class SprintSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  startDate?: Date;

  @ApiPropertyOptional()
  endDate?: Date;
}

export class BoardSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  name?: string;
}

export class TaskDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  priority!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  columnId?: string;

  @ApiPropertyOptional()
  rank?: string;

  @ApiPropertyOptional()
  sprintId?: string;

  @ApiPropertyOptional({ type: SprintSummaryDto })
  sprint?: SprintSummaryDto;

  @ApiPropertyOptional()
  boardId?: string;

  @ApiPropertyOptional({ type: BoardSummaryDto })
  board?: BoardSummaryDto;

  @ApiPropertyOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ type: [TaskLabelSummaryDto] })
  labels?: TaskLabelSummaryDto[];

  @ApiPropertyOptional({ type: TaskUserSummaryDto })
  assignee?: TaskUserSummaryDto;

  @ApiProperty()
  reporterId!: string;

  @ApiPropertyOptional({ type: TaskUserSummaryDto })
  reporter?: TaskUserSummaryDto;

  @ApiPropertyOptional()
  archivedBy?: string;

  @ApiPropertyOptional({ type: TaskUserSummaryDto })
  archivedByUser?: TaskUserSummaryDto;

  @ApiPropertyOptional()
  storyPoints?: number;

  @ApiPropertyOptional()
  dueDate?: Date;

  @ApiProperty()
  isArchived!: boolean;

  @ApiPropertyOptional()
  archivedAt?: Date;

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
