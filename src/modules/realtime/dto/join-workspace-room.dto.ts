import { IsMongoId } from 'class-validator';

export class JoinWorkspaceRoomDto {
  @IsMongoId()
  workspaceId!: string;
}
