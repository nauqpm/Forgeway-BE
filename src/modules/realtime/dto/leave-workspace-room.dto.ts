import { IsMongoId } from 'class-validator';

export class LeaveWorkspaceRoomDto {
  @IsMongoId()
  workspaceId!: string;
}
