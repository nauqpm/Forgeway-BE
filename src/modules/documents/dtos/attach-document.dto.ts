import {
  ArrayUnique,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class AttachDocumentDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  workspaceIds!: string[];
}

export class DetachDocumentDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  workspaceId!: string;
}
