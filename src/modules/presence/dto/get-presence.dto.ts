import { IsNotEmpty, IsString } from 'class-validator';

export class GetPresenceDto {
  @IsString()
  @IsNotEmpty()
  ids!: string;
}
