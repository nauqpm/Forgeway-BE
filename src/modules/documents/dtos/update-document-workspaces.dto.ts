import { ArrayUnique, IsArray, IsMongoId, IsNotEmpty } from 'class-validator';

export class UpdateDocumentWorkspacesDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  workspaceIds!: string[];
}
