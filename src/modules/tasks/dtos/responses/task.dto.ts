import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCoverDto } from '../../../task-covers/dtos/task-cover.dto';

export class TaskLabelSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class TaskUserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  fullName?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  avatar?: string;
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
  rank?: string;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({ type: TaskCoverDto })
  cover?: TaskCoverDto;

  @ApiPropertyOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ type: [TaskLabelSummaryDto] })
  labels?: TaskLabelSummaryDto[];

  @ApiProperty()
  reporterId!: string;

  @ApiPropertyOptional()
  storyPoints?: number;

  @ApiPropertyOptional()
  startDate?: Date;

  @ApiPropertyOptional()
  dueDate?: Date;

  @ApiPropertyOptional()
  epicId?: string;

  @ApiProperty()
  isArchived!: boolean;

  @ApiPropertyOptional()
  archivedAt?: Date;

  @ApiPropertyOptional()
  archivedBy?: string;

  @ApiPropertyOptional({ type: TaskUserSummaryDto })
  archivedByUser?: TaskUserSummaryDto;

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  deletedAt?: Date;

  @ApiPropertyOptional()
  deletedBy?: string;

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
