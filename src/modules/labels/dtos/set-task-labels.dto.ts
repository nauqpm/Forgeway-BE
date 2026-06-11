import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsMongoId } from 'class-validator';

export class SetTaskLabelsDto {
  @ApiProperty({ type: [String], example: ['665c0a8c3a9b1d6d9c000001'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  labelIds!: string[];
}
