import { IsMongoId, IsOptional } from 'class-validator';

export class PresenceHeartbeatDto {
  @IsMongoId()
  workspaceId!: string;

  @IsOptional()
  @IsMongoId()
  taskId?: string;
}