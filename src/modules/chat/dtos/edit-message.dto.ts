import { IsString, MaxLength } from 'class-validator';

export class EditMessageDto {
  @IsString() @MaxLength(4000) content!: string;
}
