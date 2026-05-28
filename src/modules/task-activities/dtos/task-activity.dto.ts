import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskUserSummaryDto } from '../../tasks/dtos/responses/task.dto';
import { TASK_ACTIVITY_TYPES } from '../constants/task-activity.constants';

export class TaskActivityDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty()
  taskKey!: string;

  @ApiProperty()
  actorId!: string;

  @ApiPropertyOptional({ type: TaskUserSummaryDto })
  actor?: TaskUserSummaryDto;

  @ApiProperty({ enum: TASK_ACTIVITY_TYPES })
  type!: string;

  @ApiProperty()
  metadata!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: Date;
}
