import { ApiProperty } from '@nestjs/swagger';
import { TaskActivityDto } from './task-activity.dto';

export class TaskActivityListDto {
  @ApiProperty({ type: [TaskActivityDto] })
  activities!: TaskActivityDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
