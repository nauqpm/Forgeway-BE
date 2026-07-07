import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCoverDto } from '../../../task-covers/dtos/task-cover.dto';
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

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({ type: TaskCoverDto })
  cover?: TaskCoverDto;

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
  startDate?: Date;

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

  /** Tổng số giờ đã log (cộng dồn từ tất cả WorkLog entries) */
  @ApiPropertyOptional({ description: 'Total hours logged', example: 4.5 })
  timeLogged?: number;

  /** Thời gian ước lượng còn lại (giờ) */
  @ApiPropertyOptional({
    description: 'Estimated time remaining in hours',
    example: 6,
  })
  timeEstimated?: number;
}
