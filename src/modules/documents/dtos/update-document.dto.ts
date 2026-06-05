import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;
}
