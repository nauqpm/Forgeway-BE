import { IsArray, IsMongoId, IsOptional, IsString } from 'class-validator';

export class PageYjsUpdateDto {
  @IsMongoId()
  pageId!: string;

  @IsArray()
  update!: number[];

  @IsString()
  @IsOptional()
  updateId?: string;
}
