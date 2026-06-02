import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentContentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(2097152)
  content!: string;
}
