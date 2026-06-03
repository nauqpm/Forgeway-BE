import { IsMongoId } from 'class-validator';

export class JoinTaskRoomDto {
  @IsMongoId()
  workspaceId!: string;

  @IsMongoId()
  taskId!: string;
}
