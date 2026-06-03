import { IsMongoId } from 'class-validator';

export class LeaveTaskRoomDto {
  @IsMongoId()
  taskId!: string;
}
