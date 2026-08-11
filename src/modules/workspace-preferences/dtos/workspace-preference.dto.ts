import { ArrayUnique, IsArray, IsBoolean, IsMongoId } from 'class-validator';

export class SetWorkspaceStarDto {
  @IsBoolean()
  isStarred!: boolean;
}

export class ReorderWorkspacesDto {
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  workspaceIds!: string[];
}
