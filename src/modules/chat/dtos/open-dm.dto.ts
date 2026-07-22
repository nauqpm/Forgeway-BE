import { IsArray, IsString, ArrayNotEmpty, IsMongoId } from 'class-validator';

export class OpenDmDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsMongoId({ each: true })
  targetUserIds: string[];
}
